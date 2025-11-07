const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SocialRewards", function () {
  let socialRewards, nocenite, owner, relayer, user1, user2, user3;

  beforeEach(async function () {
    [owner, relayer, user1, user2, user3] = await ethers.getSigners();

    const Nocenite = await ethers.getContractFactory("Nocenite");
    nocenite = await Nocenite.deploy(owner.address);

    const SocialRewards = await ethers.getContractFactory("SocialRewards");
    socialRewards = await SocialRewards.deploy(
      await nocenite.getAddress(),
      relayer.address,
      owner.address
    );

    await nocenite.setMinter(await socialRewards.getAddress());
  });

  async function createSignature(users, amounts, interactionIds, signer) {
    const messageHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "bytes32[]"],
      [users, amounts, interactionIds]
    ));
    return await signer.signMessage(ethers.getBytes(messageHash));
  }

  describe("Deployment", function () {
    it("Should set the correct nocenite token", async function () {
      expect(await socialRewards.nocenite()).to.equal(await nocenite.getAddress());
    });

    it("Should set the correct relayer", async function () {
      expect(await socialRewards.relayer()).to.equal(relayer.address);
    });

    it("Should set the correct owner", async function () {
      expect(await socialRewards.owner()).to.equal(owner.address);
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to update relayer", async function () {
      await socialRewards.updateRelayer(user1.address);
      expect(await socialRewards.relayer()).to.equal(user1.address);
    });

    it("Should revert if non-owner tries to update relayer", async function () {
      await expect(
        socialRewards.connect(user1).updateRelayer(user1.address)
      ).to.be.revertedWithCustomError(socialRewards, "OwnableUnauthorizedAccount");
    });

    it("Should revert if updating relayer to zero address", async function () {
      await expect(
        socialRewards.updateRelayer(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(socialRewards, "ZeroAddress");
    });
  });

  describe("Batch Processing", function () {
    it("Should batch process multiple interactions with valid signature", async function () {
      const users = [user1.address, user2.address, user3.address];
      const amounts = [ethers.parseEther("1"), ethers.parseEther("3"), ethers.parseEther("2")];
      const interactionIds = [
        ethers.keccak256(ethers.toUtf8Bytes("like_1")),
        ethers.keccak256(ethers.toUtf8Bytes("comment_1")),
        ethers.keccak256(ethers.toUtf8Bytes("reaction_1"))
      ];

      const signature = await createSignature(users, amounts, interactionIds, relayer);

      await socialRewards.connect(relayer).batchRewardSocialInteractions(users, amounts, interactionIds, signature);

      expect(await nocenite.balanceOf(user1.address)).to.equal(ethers.parseEther("1"));
      expect(await nocenite.balanceOf(user2.address)).to.equal(ethers.parseEther("3"));
      expect(await nocenite.balanceOf(user3.address)).to.equal(ethers.parseEther("2"));
    });

    it("Should prevent double processing of same interaction", async function () {
      const users = [user1.address];
      const amounts = [ethers.parseEther("1")];
      const interactionIds = [ethers.keccak256(ethers.toUtf8Bytes("like_1"))];

      // First signature
      const signature1 = await createSignature(users, amounts, interactionIds, relayer);
      await socialRewards.connect(relayer).batchRewardSocialInteractions(users, amounts, interactionIds, signature1);

      // Second call with same interaction ID but different signature (different nonce/timestamp)
      const users2 = [user1.address];
      const amounts2 = [ethers.parseEther("2")]; // Different amount to create different signature
      const interactionIds2 = [ethers.keccak256(ethers.toUtf8Bytes("like_1"))]; // Same interaction ID

      const signature2 = await createSignature(users2, amounts2, interactionIds2, relayer);
      await socialRewards.connect(relayer).batchRewardSocialInteractions(users2, amounts2, interactionIds2, signature2);

      // Should still only have 1 NCT (first amount) because interaction was already processed
      expect(await nocenite.balanceOf(user1.address)).to.equal(ethers.parseEther("1"));
    });

    it("Should revert with invalid signature", async function () {
      const users = [user1.address];
      const amounts = [ethers.parseEther("1")];
      const interactionIds = [ethers.keccak256(ethers.toUtf8Bytes("like_1"))];

      const invalidSignature = await createSignature(users, amounts, interactionIds, user1);

      await expect(
        socialRewards.connect(relayer).batchRewardSocialInteractions(users, amounts, interactionIds, invalidSignature)
      ).to.be.revertedWithCustomError(socialRewards, "InvalidSignature");
    });

    it("Should revert if signature is reused", async function () {
      const users = [user1.address];
      const amounts = [ethers.parseEther("1")];
      const interactionIds = [ethers.keccak256(ethers.toUtf8Bytes("like_1"))];

      const signature = await createSignature(users, amounts, interactionIds, relayer);

      await socialRewards.connect(relayer).batchRewardSocialInteractions(users, amounts, interactionIds, signature);

      await expect(
        socialRewards.connect(relayer).batchRewardSocialInteractions(users, amounts, interactionIds, signature)
      ).to.be.revertedWithCustomError(socialRewards, "SignatureAlreadyUsed");
    });

    it("Should revert if arrays have different lengths", async function () {
      const users = [user1.address, user2.address];
      const amounts = [ethers.parseEther("1")];
      const interactionIds = [ethers.keccak256(ethers.toUtf8Bytes("like_1"))];
      const signature = await createSignature(users, amounts, interactionIds, relayer);

      await expect(
        socialRewards.connect(relayer).batchRewardSocialInteractions(users, amounts, interactionIds, signature)
      ).to.be.revertedWithCustomError(socialRewards, "ArrayLengthMismatch");
    });

    it("Should revert if batch size exceeds limit", async function () {
      const oversizedBatch = 501;
      const users = Array(oversizedBatch).fill(user1.address);
      const amounts = Array(oversizedBatch).fill(ethers.parseEther("1"));
      const interactionIds = Array(oversizedBatch).fill(0).map((_, i) => 
        ethers.keccak256(ethers.toUtf8Bytes(`oversized_${i}`))
      );
      const signature = await createSignature(users, amounts, interactionIds, relayer);

      await expect(
        socialRewards.connect(relayer).batchRewardSocialInteractions(users, amounts, interactionIds, signature)
      ).to.be.revertedWithCustomError(socialRewards, "BatchSizeExceedsLimit");
    });

    it("Should allow exactly 500 interactions", async function () {
      const maxBatch = 500;
      const users = Array(maxBatch).fill(user1.address);
      const amounts = Array(maxBatch).fill(ethers.parseEther("1"));
      const interactionIds = Array(maxBatch).fill(0).map((_, i) => 
        ethers.keccak256(ethers.toUtf8Bytes(`max_batch_${i}`))
      );
      const signature = await createSignature(users, amounts, interactionIds, relayer);

      await expect(
        socialRewards.connect(relayer).batchRewardSocialInteractions(users, amounts, interactionIds, signature)
      ).to.not.be.reverted;
    });

    it("Should revert if non-relayer tries to batch process", async function () {
      const users = [user1.address];
      const amounts = [ethers.parseEther("1")];
      const interactionIds = [ethers.keccak256(ethers.toUtf8Bytes("like_1"))];
      const signature = await createSignature(users, amounts, interactionIds, relayer);

      await expect(
        socialRewards.connect(user1).batchRewardSocialInteractions(users, amounts, interactionIds, signature)
      ).to.be.revertedWithCustomError(socialRewards, "NotRelayer");
    });
  });
});
