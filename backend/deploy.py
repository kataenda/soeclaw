"""
Smart contract deployment for Mantle L2.
ERC-20: pure Solidity template (no external dependencies) compiled via py-solc-x.
"""
import asyncio
import re


_ERC20_TEMPLATE = '''// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract {contract_name} {{
    string public name = "{token_name}";
    string public symbol = "{symbol}";
    uint8 public decimals = {decimals};
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {{
        owner = msg.sender;
        totalSupply = {supply} * (10 ** uint256(decimals));
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }}

    function transfer(address to, uint256 amount) public returns (bool) {{
        _transfer(msg.sender, to, amount);
        return true;
    }}

    function approve(address spender, uint256 amount) public returns (bool) {{
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }}

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {{
        require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }}

    function mint(address to, uint256 amount) public {{
        require(msg.sender == owner, "ERC20: not owner");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }}

    function burn(uint256 amount) public {{
        require(balanceOf[msg.sender] >= amount, "ERC20: burn exceeds balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }}

    function _transfer(address from, address to, uint256 amount) internal {{
        require(to != address(0), "ERC20: transfer to zero address");
        require(balanceOf[from] >= amount, "ERC20: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }}
}}
'''


def _to_contract_name(token_name: str) -> str:
    name = re.sub(r'[^a-zA-Z0-9]', '', token_name)
    if not name:
        name = "Token"
    if name[0].isdigit():
        name = "T" + name
    return name


def generate_erc20(token_name: str, symbol: str, supply: int, decimals: int = 18) -> tuple[str, str]:
    """Returns (solidity_source, contract_name)."""
    contract_name = _to_contract_name(token_name)
    source = _ERC20_TEMPLATE.format(
        contract_name=contract_name,
        token_name=token_name,
        symbol=symbol.upper()[:10],
        decimals=decimals,
        supply=supply,
    )
    return source, contract_name


def _parse_supply(text: str) -> int | None:
    """Parse supply number with optional k/m/jt/rb suffix."""
    text = text.lower().strip().replace(',', '').replace('.', '')
    if text.endswith('jt'):
        return int(float(text[:-2]) * 1_000_000)
    if text.endswith('rb'):
        return int(float(text[:-2]) * 1_000)
    if text.endswith('m'):
        return int(float(text[:-1]) * 1_000_000)
    if text.endswith('k'):
        return int(float(text[:-1]) * 1_000)
    try:
        return int(text)
    except ValueError:
        return None


def parse_deploy_params(msg: str) -> dict | None:
    """
    Parse deploy parameters from natural language.
    Supports: "deploy token MyToken MYT 1000000" / "buat token bernama X simbol Y supply Z"
    Returns {name, symbol, supply, decimals} or None if not enough info.
    """
    # Name patterns
    name = None
    m = re.search(r'(?:bernama|named?|token name|nama token)\s+([A-Za-z][A-Za-z0-9 ]{1,29}?)(?:\s+(?:simbol|symbol|supply|jumlah|\d)|$)', msg, re.I)
    if m:
        name = m.group(1).strip()

    # Symbol patterns
    symbol = None
    m = re.search(r'(?:simbol|symbol|ticker|sym)\s*[:\-]?\s*([A-Za-z]{2,10})\b', msg, re.I)
    if m:
        symbol = m.group(1).upper()

    # Supply patterns
    supply = None
    m = re.search(r'(?:supply|jumlah|total supply|initial supply)\s*[:\-]?\s*([\d,\.]+(?:jt|rb|k|m)?)\b', msg, re.I)
    if m:
        supply = _parse_supply(m.group(1))
    if supply is None:
        # Fallback: any bare large number in the message
        numbers = re.findall(r'\b(\d[\d,\.]{2,}(?:jt|rb|k|m)?)\b', msg, re.I)
        for n in numbers:
            v = _parse_supply(n)
            if v and v >= 1000:
                supply = v
                break

    # If name not found via pattern, try positional: "deploy token <NAME> <SYM> <SUPPLY>"
    if not name or not symbol:
        words = [w for w in re.split(r'\s+', msg) if w.lower() not in
                 ('deploy', 'buat', 'create', 'token', 'contract', 'kontrak', 'erc20', 'erc-20',
                  'di', 'ke', 'on', 'mantle', 'solana', 'dengan', 'with', 'supply')]
        cap_words = [w for w in words if w and w[0].isupper() and not w.isdigit()]
        if not name and cap_words:
            name = cap_words[0]
        if not symbol and len(cap_words) > 1:
            candidate = cap_words[1].upper()
            if 2 <= len(candidate) <= 10:
                symbol = candidate

    if not name or not symbol or not supply:
        return None

    return {"name": name.strip(), "symbol": symbol[:10], "supply": supply, "decimals": 18}


async def compile_solidity(source: str, contract_name: str) -> dict:
    """Compile Solidity with py-solc-x. Returns {abi, bytecode}."""
    def _compile():
        from solcx import compile_source, install_solc, get_installed_solc_versions
        installed = get_installed_solc_versions()
        if not installed:
            print("[Deploy] Installing solc 0.8.20…")
            install_solc("0.8.20", show_progress=False)
        compiled = compile_source(source, output_values=["abi", "bin"], solc_version="0.8.20")
        key = next((k for k in compiled if contract_name in k), next(iter(compiled)))
        return {"abi": compiled[key]["abi"], "bytecode": compiled[key]["bin"]}

    return await asyncio.to_thread(_compile)
