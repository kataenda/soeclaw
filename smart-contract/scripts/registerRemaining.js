import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_ADDRESS = "0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d";
const AGENT_CARD_BASE_URL =
  "https://raw.githubusercontent.com/soesoe/mantlemind-ai/main/smart-contract/agent-cards/";

// Only remaining agents (0=AlphaQuant, 1=WhaleWatcher already registered)
const REMAINING = [
  { name: "MacroAnalyzer", file: "macroanalyzer.json", strategy: "trend_following" },
  { name: "RiskManager",   file: "riskmanager.json",   strategy: "volatility_management" },
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const Registry = await hre.ethers.getContractFactory("AgentIdentityRegistry");
  const registry = Registry.attach(REGISTRY_ADDRESS);

  console.log(`\nAccount: ${deployer.address}`);
  console.log(`Registry: ${REGISTRY_ADDRESS}`);
  console.log(`Total agents so far: ${await registry.totalAgents()}\n`);

  const results = [];

  for (const agent of REMAINING) {
    const agentURI = `${AGENT_CARD_BASE_URL}${agent.file}`;
    console.log(`Registering ${agent.name}...`);

    // Step 1: Register
    const regTx = await registry["register(string)"](agentURI, {
      gasLimit: 500000,
    });
    const regReceipt = await regTx.wait();
    console.log(`  register tx: ${regTx.hash}`);

    const event = regReceipt.logs
      .map(log => { try { return registry.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "Registered");

    if (!event) {
      console.error(`  ❌ Registered event not found for ${agent.name}`);
      continue;
    }

    const agentId = Number(event.args.agentId);
    console.log(`  Token ID: ${agentId}`);

    // Step 2: Set metadata individually (avoid batchSetMetadata edge case)
    for (const [key, val] of [
      ["strategy",  agent.strategy],
      ["platform",  "SoeClaw OS"],
      ["hackathon", "Turing Test by Mantle"],
    ]) {
      const tx = await registry.setMetadata(
        agentId,
        key,
        hre.ethers.toUtf8Bytes(val),
        { gasLimit: 200000 }
      );
      await tx.wait();
    }

    console.log(`  ✅ ${agent.name} registered — Token ID: ${agentId}`);
    results.push({ name: agent.name, tokenId: agentId, agentCardURI: agentURI });
  }

  // Summary
  console.log("\n── All Agent Identities ────────────────────────────────");
  const total = Number(await registry.totalAgents());
  for (let i = 0; i < total; i++) {
    const identity = await registry.getAgentIdentity(i);
    console.log(`  Token ${i}: ${identity.agentURI.split("/").pop()?.replace(".json","")} | Owner: ${identity.owner}`);
  }

  // Update deployment file
  const depPath = path.join(__dirname, "../deployment-erc8004.json");
  let deployment = {};
  if (fs.existsSync(depPath)) {
    deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
  }

  deployment.agents = deployment.agents || [];
  for (const r of results) {
    deployment.agents.push({
      ...r,
      explorerUrl: `https://explorer.sepolia.mantle.xyz/token/${REGISTRY_ADDRESS}?a=${r.tokenId}`,
    });
  }
  fs.writeFileSync(depPath, JSON.stringify(deployment, null, 2));
  console.log("\n📄 Updated deployment-erc8004.json\n");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
