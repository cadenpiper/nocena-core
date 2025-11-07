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

  // Deploy SocialRewards contract (relayer authorized)
  console.log("Deploying SocialRewards contract...");
  const SocialRewards = await ethers.getContractFactory("SocialRewards");
  const socialRewards = await SocialRewards.deploy(
    await nocenite.getAddress(),
    "0x8FCF7daA7d137dA0DC93B9868f967509Afe70e5a",
    deployer.address
  );
  await socialRewards.waitForDeployment();

  // Authorize both contracts as minters
  console.log("\nSetting up minter permissions...");
  await nocenite.setMinter(await challengeRewards.getAddress(), true);
  console.log("ChallengeRewards authorized as minter");
  
  await nocenite.setMinter(await socialRewards.getAddress(), true);
  console.log("SocialRewards authorized as minter");
  
  // Renounce ownership for full decentralization
  console.log("\nRenouncing Nocenite ownership...");
  await nocenite.connect(deployer).renounceOwnership();
  
  console.log("\nDeployment complete!");
  console.log("Nocenite:", await nocenite.getAddress());
  console.log("ChallengeRewards (Authorized Minter):", await challengeRewards.getAddress());
  console.log("SocialRewards (Authorized Minter):", await socialRewards.getAddress());
  console.log("\nBoth contracts can now mint NCT tokens");
  console.log("Nocenite ownership renounced for decentralization\n");
}

main().catch(console.error);
