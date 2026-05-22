import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// After pushing to GitHub, update this to your actual repo raw URL
// e.g. https://raw.githubusercontent.com/YOUR_USER/mantlemind-ai/main/smart-contract/agent-cards/
const AGENT_CARD_BASE_URL = process.env.AGENT_CARD_BASE_URL ||
  "https://raw.githubusercontent.com/soesoe/mantlemind-ai/main/smart-contract/agent-cards/";

const AGENTS = [
  { name: "AlphaQuant",    file: "alphaquant.json",    strategy: "momentum" },
  { name: "WhaleWatcher",  file: "whalewatcher.json",  strategy: "mean_reversion" },
  { name: "MacroAnalyzer", file: "macroanalyzer.json", strategy: "trend_following" },
  { name: "RiskManager",   file: "riskmanager.json",   strategy: "volatility_management" },
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nDeploying with account: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} MNT\n`);

  // ── 1. Deploy AgentIdentityRegistry ────────────────────────────────────
  console.log("Deploying AgentIdentityRegistry (ERC-8004)...");
  const Registry = await hre.ethers.getContractFactory("AgentIdentityRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`✅ AgentIdentityRegistry deployed: ${registryAddress}`);

  // ── 2. Register 4 AI Agents (mint ERC-8004 identity NFTs) ───────────────
  console.log("\nRegistering AI agents...");
  const tokenIds = [];

  for (const agent of AGENTS) {
    const agentURI = `${AGENT_CARD_BASE_URL}${agent.file}`;
    const tx = await registry["register(string)"](agentURI);
    const receipt = await tx.wait();

    // Parse Registered event to get agentId
    const event = receipt.logs
      .map(log => { try { return registry.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "Registered");

    const agentId = event ? Number(event.args.agentId) : tokenIds.length;
    tokenIds.push(agentId);

    // Set metadata on-chain
    await (await registry.batchSetMetadata(agentId, [
      { metadataKey: "strategy",  metadataValue: hre.ethers.toUtf8Bytes(agent.strategy) },
      { metadataKey: "platform",  metadataValue: hre.ethers.toUtf8Bytes("SoeClaw OS") },
      { metadataKey: "hackathon", metadataValue: hre.ethers.toUtf8Bytes("Turing Test by Mantle") },
      { metadataKey: "chainId",   metadataValue: hre.ethers.toUtf8Bytes("5003") },
    ])).wait();

    console.log(`  ✅ ${agent.name} — Token ID: ${agentId} | URI: ${agentURI}`);
  }

  // ── 3. Verify all agents registered ────────────────────────────────────
  console.log("\n── Agent Identity Summary ──────────────────────────────");
  for (let i = 0; i < AGENTS.length; i++) {
    const identity = await registry.getAgentIdentity(tokenIds[i]);
    console.log(`  ${AGENTS[i].name}`);
    console.log(`    Token ID  : ${tokenIds[i]}`);
    console.log(`    Owner     : ${identity.owner}`);
    console.log(`    URI       : ${identity.agentURI}`);
    console.log(`    Trades    : ${identity.totalTrades}`);
  }

  // ── 4. Save deployment info ─────────────────────────────────────────────
  const deployment = {
    network: hre.network.name,
    chainId: 5003,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      AgentIdentityRegistry: {
        address: registryAddress,
        standard: "ERC-8004",
        explorerUrl: `https://explorer.sepolia.mantle.xyz/address/${registryAddress}`,
      },
    },
    agents: AGENTS.map((a, i) => ({
      name: a.name,
      tokenId: tokenIds[i],
      strategy: a.strategy,
      agentCardURI: `${AGENT_CARD_BASE_URL}${a.file}`,
      explorerUrl: `https://explorer.sepolia.mantle.xyz/token/${registryAddress}?a=${tokenIds[i]}`,
    })),
  };

  const outPath = path.join(__dirname, "../deployment-erc8004.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`\n📄 Deployment info saved to: deployment-erc8004.json`);

  console.log("\n── Next Steps ──────────────────────────────────────────");
  console.log(`  1. Verify on Mantle Explorer:`);
  console.log(`     npx hardhat verify --network mantleTestnet ${registryAddress}`);
  console.log(`  2. Update AGENT_CARD_BASE_URL in .env to your GitHub raw URL`);
  console.log(`  3. Add IDENTITY_REGISTRY_ADDRESS=${registryAddress} to backend .env`);
  console.log("────────────────────────────────────────────────────────\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
