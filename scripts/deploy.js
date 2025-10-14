const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("\nDeploying contracts...");
  console.log("Deployer address:", deployer.address);
  console.log("Relayer:", "0x8FCF7daA7d137dA0DC93B9868f967509Afe70e5a");

  // Deploy Nocenite token
  console.log("\nDeploying Nocenite token...");
  const Nocenite = await ethers.getContractFactory("Nocenite");
  const nocenite = await Nocenite.deploy(deployer.address);
  await nocenite.waitForDeployment();
  
  // Deploy ChallengeRewards contract (relayer authorized)
  console.log("Deploying ChallengeRewards contract...");
  const ChallengeRewards = await ethers.getContractFactory("ChallengeRewards");
  const challengeRewards = await ChallengeRewards.deploy(
    await nocenite.getAddress(),
    "0x8FCF7daA7d137dA0DC93B9868f967509Afe70e5a",
    deployer.address
  );
  await challengeRewards.waitForDeployment();

  // Set ChallengeRewards as authorized minter
  console.log("\nSetting up minter permissions...");
  await nocenite.setMinter(await challengeRewards.getAddress());
  
  // Renounce ownership for full decentralization
  console.log("Renouncing Nocenite ownership...");
  await nocenite.connect(deployer).renounceOwnership();
  
  console.log("\nDeployment complete!");
  console.log("Nocenite:", await nocenite.getAddress());
  console.log("ChallengeRewards (Authorized Minter):", await challengeRewards.getAddress());
  console.log("\nNocenite ownership renounced for decentralization\n");
}

main().catch(console.error);
