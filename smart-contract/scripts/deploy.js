import hre from "hardhat";

async function main() {
  const SoeClaw = await hre.ethers.getContractFactory("SoeClaw");
  const soeclaw = await SoeClaw.deploy();

  await soeclaw.waitForDeployment();

  const address = await soeclaw.getAddress();
  console.log(`SoeClaw deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
