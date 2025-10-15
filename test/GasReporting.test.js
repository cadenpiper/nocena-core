const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Gas Reporting", function () {
  let nocenite;
  let challengeRewards;
  let owner;
  let relayerSigner;
  let user1;

  beforeEach(async function () {
    [owner, relayerSigner, user1] = await ethers.getSigners();
    
    // Deploy Nocenite token with deployer as owner
    const NoceniteFactory = await ethers.getContractFactory("Nocenite");
    nocenite = await NoceniteFactory.deploy(owner.address);
    await nocenite.waitForDeployment();
    
    // Deploy ChallengeRewards with relayer address and deployer as owner
    const ChallengeRewardsFactory = await ethers.getContractFactory("ChallengeRewards");
    challengeRewards = await ChallengeRewardsFactory.deploy(
      await nocenite.getAddress(),
      relayerSigner.address,
      owner.address
    );
    await challengeRewards.waitForDeployment();
    
    // Set ChallengeRewards as authorized minter
    await nocenite.setMinter(await challengeRewards.getAddress());
    
    // Renounce ownership for full decentralization
    await nocenite.connect(owner).renounceOwnership();
  });

  async function createValidSignature(user, challengeType, ipfsHash) {
    const messageHash = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "string", "string"],
      [user.address, challengeType, ipfsHash]
    );
    const finalHash = ethers.keccak256(messageHash);
    return await relayerSigner.signMessage(ethers.getBytes(finalHash));
  }

  describe("Successful Token Minting Flows", function () {
    it("Daily challenge completion", async function () {
      const signature = await createValidSignature(user1, "daily", "QmTest");
      await challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, "QmTest", signature);
    });

    it("Weekly challenge completion", async function () {
      const signature = await createValidSignature(user1, "weekly", "QmTest");
      await challengeRewards.connect(relayerSigner).completeWeeklyChallenge(user1.address, "QmTest", signature);
    });

    it("Monthly challenge completion", async function () {
      const signature = await createValidSignature(user1, "monthly", "QmTest");
      await challengeRewards.connect(relayerSigner).completeMonthlyChallenge(user1.address, "QmTest", signature);
    });
  });
});
