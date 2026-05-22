import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_ADDRESS = "0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d";

const AGENT_CARD_BASE_URL =
  "https://raw.githubusercontent.com/kataenda/soeclaw/main/smart-contract/agent-cards/";

const AGENTS = [
  { name: "AlphaQuant",    file: "alphaquant.json",    strategy: "momentum" },
  { name: "WhaleWatcher",  file: "whalewatcher.json",  strategy: "mean_reversion" },
  { name: "MacroAnalyzer", file: "macroanalyzer.json", strategy: "trend_following" },
  { name: "RiskManager",   file: "riskmanager.json",   strategy: "volatility_management" },
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nRegistering agents with account: ${deployer.address}`);

  const Registry = await hre.ethers.getContractFactory("AgentIdentityRegistry");
  const registry = Registry.attach(REGISTRY_ADDRESS);

  console.log(`Using registry: ${REGISTRY_ADDRESS}\n`);

  const tokenIds = [];

  for (const agent of AGENTS) {
    const agentURI = `${AGENT_CARD_BASE_URL}${agent.file}`;
    console.log(`Registering ${agent.name}...`);

    const tx = await registry["register(string)"](agentURI);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => { try { return registry.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "Registered");

    const agentId = event ? Number(event.args.agentId) : tokenIds.length;
    tokenIds.push(agentId);

    await (await registry.batchSetMetadata(agentId, [
      { metadataKey: "strategy",  metadataValue: hre.ethers.toUtf8Bytes(agent.strategy) },
      { metadataKey: "platform",  metadataValue: hre.ethers.toUtf8Bytes("SoeClaw OS") },
      { metadataKey: "hackathon", metadataValue: hre.ethers.toUtf8Bytes("Turing Test by Mantle") },
    ])).wait();

    console.log(`  ✅ Token ID: ${agentId} | URI: ${agentURI}`);
  }

  console.log("\n── Agent Identity Summary ──────────────────────────────");
  for (let i = 0; i < AGENTS.length; i++) {
    const identity = await registry.getAgentIdentity(tokenIds[i]);
    console.log(`  ${AGENTS[i].name} — Token ID: ${tokenIds[i]} — Owner: ${identity.owner}`);
  }

  const deployment = {
    network: "mantleTestnet",
    chainId: 5003,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      AgentIdentityRegistry: {
        address: REGISTRY_ADDRESS,
        standard: "ERC-8004",
        explorerUrl: `https://explorer.sepolia.mantle.xyz/address/${REGISTRY_ADDRESS}`,
      },
    },
    agents: AGENTS.map((a, i) => ({
      name: a.name,
      tokenId: tokenIds[i],
      strategy: a.strategy,
      agentCardURI: `${AGENT_CARD_BASE_URL}${a.file}`,
      explorerUrl: `https://explorer.sepolia.mantle.xyz/token/${REGISTRY_ADDRESS}?a=${tokenIds[i]}`,
    })),
  };

  fs.writeFileSync(
    path.join(__dirname, "../deployment-erc8004.json"),
    JSON.stringify(deployment, null, 2)
  );

  console.log("\n📄 Saved to deployment-erc8004.json");
  console.log(`🔗 Registry: https://explorer.sepolia.mantle.xyz/address/${REGISTRY_ADDRESS}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
