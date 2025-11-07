const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Gas Reporting", function () {
  let nocenite;
  let challengeRewards;
  let socialRewards;
  let owner;
  let relayerSigner;
  let user1;

  async function createChallengeSignature(user, challengeType, ipfsHash) {
    const messageHash = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "string", "string"],
      [user.address, challengeType, ipfsHash]
    );
    const finalHash = ethers.keccak256(messageHash);
    return await relayerSigner.signMessage(ethers.getBytes(finalHash));
  }

  async function createSocialSignature(users, amounts, interactionIds) {
    const messageHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "bytes32[]"],
      [users, amounts, interactionIds]
    ));
    return await relayerSigner.signMessage(ethers.getBytes(messageHash));
  }

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

    // Deploy SocialRewards with relayer address and deployer as owner
    const SocialRewardsFactory = await ethers.getContractFactory("SocialRewards");
    socialRewards = await SocialRewardsFactory.deploy(
      await nocenite.getAddress(),
      relayerSigner.address,
      owner.address
    );
    await socialRewards.waitForDeployment();
    
    // Set ChallengeRewards as authorized minter
    await nocenite.setMinter(await challengeRewards.getAddress());
  });

  describe("Challenge Rewards Gas Usage", function () {
    it("Daily challenge completion", async function () {
      const signature = await createChallengeSignature(user1, "daily", "QmTest");
      await challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, "QmTest", signature);
    });

    it("Weekly challenge completion", async function () {
      const signature = await createChallengeSignature(user1, "weekly", "QmTest");
      await challengeRewards.connect(relayerSigner).completeWeeklyChallenge(user1.address, "QmTest", signature);
    });

    it("Monthly challenge completion", async function () {
      const signature = await createChallengeSignature(user1, "monthly", "QmTest");
      await challengeRewards.connect(relayerSigner).completeMonthlyChallenge(user1.address, "QmTest", signature);
    });

    it("Private challenge completion", async function () {
      const signature = await createChallengeSignature(user1, "private", "QmTest");
      await challengeRewards.connect(relayerSigner).completePrivateChallenge(user1.address, relayerSigner.address, ethers.parseEther("100"), "QmTest", signature);
    });
  });

  describe("Social Rewards Gas Usage", function () {
    beforeEach(async function () {
      // Set SocialRewards as authorized minter for these tests
      await nocenite.setMinter(await socialRewards.getAddress());
    });

    it("Single social interaction", async function () {
      const users = [user1.address];
      const amounts = [ethers.parseEther("1")];
      const interactionIds = [ethers.keccak256(ethers.toUtf8Bytes("like_1"))];
      const signature = await createSocialSignature(users, amounts, interactionIds);
      
      await socialRewards.connect(relayerSigner).batchRewardSocialInteractions(users, amounts, interactionIds, signature);
    });

    it("Small batch (10 interactions)", async function () {
      const users = Array(10).fill(user1.address);
      const amounts = Array(10).fill(ethers.parseEther("1"));
      const interactionIds = Array(10).fill(0).map((_, i) => 
        ethers.keccak256(ethers.toUtf8Bytes(`interaction_${i}`))
      );
      const signature = await createSocialSignature(users, amounts, interactionIds);
      
      await socialRewards.connect(relayerSigner).batchRewardSocialInteractions(users, amounts, interactionIds, signature);
    });

    it("Large batch (100 interactions)", async function () {
      const users = Array(100).fill(user1.address);
      const amounts = Array(100).fill(ethers.parseEther("1"));
      const interactionIds = Array(100).fill(0).map((_, i) => 
        ethers.keccak256(ethers.toUtf8Bytes(`batch_interaction_${i}`))
      );
      const signature = await createSocialSignature(users, amounts, interactionIds);
      
      await socialRewards.connect(relayerSigner).batchRewardSocialInteractions(users, amounts, interactionIds, signature);
    });
  });
});
