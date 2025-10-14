const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChallengeRewards", function () {
  let nocenite;
  let challengeRewards;
  let owner;
  let relayerSigner;
  let user1;
  let user2;

  // Challenge configuration for parameterized tests
  const challengeTypes = [
    { name: "daily", duration: 86400, reward: "100", func: "completeDailyChallenge" },
    { name: "weekly", duration: 604800, reward: "500", func: "completeWeeklyChallenge" },
    { name: "monthly", duration: 2592000, reward: "2500", func: "completeMonthlyChallenge" }
  ];

  // Deploy fresh contracts before each test
  beforeEach(async function () {
    [owner, relayerSigner, user1, user2] = await ethers.getSigners();
    
    const NoceniteFactory = await ethers.getContractFactory("Nocenite");
    nocenite = await NoceniteFactory.deploy(owner.address);
    await nocenite.waitForDeployment();
    
    const ChallengeRewardsFactory = await ethers.getContractFactory("ChallengeRewards");
    challengeRewards = await ChallengeRewardsFactory.deploy(
      await nocenite.getAddress(),
      relayerSigner.address,
      owner.address
    );
    await challengeRewards.waitForDeployment();
    
    // Set ChallengeRewards as authorized minter
    await nocenite.connect(owner).setMinter(await challengeRewards.getAddress());
  });

  // Helper function to create valid relayer signatures
  async function createValidSignature(user, challengeType, ipfsHash, signer = relayerSigner) {
    const messageHash = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "string", "string"],
      [user.address, challengeType, ipfsHash]
    );
    const finalHash = ethers.keccak256(messageHash);
    return await signer.signMessage(ethers.getBytes(finalHash));
  }

  describe("Deployment", function () {
    it("Should initialize with correct contract references", async function () {
      expect(await challengeRewards.nocenite()).to.equal(await nocenite.getAddress());
      expect(await challengeRewards.relayer()).to.equal(relayerSigner.address);
    });

    it("Should set correct reward amounts", async function () {
      expect(await challengeRewards.DAILY_REWARD()).to.equal(ethers.parseEther("100"));
      expect(await challengeRewards.WEEKLY_REWARD()).to.equal(ethers.parseEther("500"));
      expect(await challengeRewards.MONTHLY_REWARD()).to.equal(ethers.parseEther("2500"));
    });

    it("Should reject zero address parameters", async function () {
      const ChallengeRewardsFactory = await ethers.getContractFactory("ChallengeRewards");
      
      await expect(ChallengeRewardsFactory.deploy(ethers.ZeroAddress, relayerSigner.address, owner.address))
        .to.be.revertedWithCustomError(challengeRewards, "ZeroAddress");
      
      await expect(ChallengeRewardsFactory.deploy(await nocenite.getAddress(), ethers.ZeroAddress, owner.address))
        .to.be.revertedWithCustomError(challengeRewards, "ZeroAddress");
      
      await expect(ChallengeRewardsFactory.deploy(await nocenite.getAddress(), relayerSigner.address, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(challengeRewards, "OwnableInvalidOwner");
    });
  });

  describe("Challenge Completion", function () {
    // Test each challenge type with parameterized approach
    challengeTypes.forEach(({ name, duration, reward, func }) => {
      describe(`${name} challenges`, function () {
        it(`Should complete ${name} challenge and mint ${reward} NCT`, async function () {
          const ipfsHash = `Qm${name}123`;
          const signature = await createValidSignature(user1, name, ipfsHash);
          
          await expect(challengeRewards.connect(relayerSigner)[func](user1.address, ipfsHash, signature))
            .to.emit(challengeRewards, "ChallengeCompleted")
            .withArgs(user1.address, name, ethers.parseEther(reward), ipfsHash);
          
          expect(await nocenite.balanceOf(user1.address)).to.equal(ethers.parseEther(reward));
        });

        it(`Should enforce ${name} cooldown period`, async function () {
          const ipfsHash1 = `Qm${name}123`;
          const signature1 = await createValidSignature(user1, name, ipfsHash1);
          
          await challengeRewards.connect(relayerSigner)[func](user1.address, ipfsHash1, signature1);
          
          const ipfsHash2 = `Qm${name}456`;
          const signature2 = await createValidSignature(user1, name, ipfsHash2);
          
          await expect(challengeRewards.connect(relayerSigner)[func](user1.address, ipfsHash2, signature2))
            .to.be.revertedWithCustomError(challengeRewards, "CooldownActive");
        });

        it(`Should allow ${name} challenge after cooldown expires`, async function () {
          const ipfsHash1 = `Qm${name}123`;
          const signature1 = await createValidSignature(user1, name, ipfsHash1);
          
          await challengeRewards.connect(relayerSigner)[func](user1.address, ipfsHash1, signature1);
          
          await ethers.provider.send("evm_increaseTime", [duration]);
          await ethers.provider.send("evm_mine");
          
          const ipfsHash2 = `Qm${name}456`;
          const signature2 = await createValidSignature(user1, name, ipfsHash2);
          
          await expect(challengeRewards.connect(relayerSigner)[func](user1.address, ipfsHash2, signature2))
            .to.emit(challengeRewards, "ChallengeCompleted");
        });
      });
    });

    it("Should track last claim timestamps correctly", async function () {
      const ipfsHash = "QmTest123";
      const signature = await createValidSignature(user1, "daily", ipfsHash);
      
      const tx = await challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, ipfsHash, signature);
      const block = await ethers.provider.getBlock(tx.blockNumber);
      
      expect(await challengeRewards.lastClaim(user1.address, "daily")).to.equal(block.timestamp);
    });

    it("Should allow multiple challenge types on same day", async function () {
      const signatures = await Promise.all(challengeTypes.map(({ name }) => 
        createValidSignature(user1, name, `Qm${name}123`)
      ));
      
      for (let i = 0; i < challengeTypes.length; i++) {
        await challengeRewards.connect(relayerSigner)[challengeTypes[i].func](user1.address, `Qm${challengeTypes[i].name}123`, signatures[i]);
      }
      
      expect(await nocenite.balanceOf(user1.address)).to.equal(ethers.parseEther("3100"));
    });

    it("Should handle multiple users independently", async function () {
      const ipfsHash1 = "QmTest123";
      const signature1 = await createValidSignature(user1, "daily", ipfsHash1);
      
      const ipfsHash2 = "QmTest456";
      const signature2 = await createValidSignature(user2, "daily", ipfsHash2);
      
      await challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, ipfsHash1, signature1);
      await challengeRewards.connect(relayerSigner).completeDailyChallenge(user2.address, ipfsHash2, signature2);
      
      expect(await nocenite.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
      expect(await nocenite.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Security Validation", function () {
    it("Should reject invalid signatures", async function () {
      const ipfsHash = "QmTest123";
      const signature = await createValidSignature(user1, "daily", ipfsHash, user2);
      
      await expect(challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, ipfsHash, signature))
        .to.be.revertedWithCustomError(challengeRewards, "InvalidSignature");
    });

    it("Should prevent signature replay attacks", async function () {
      const ipfsHash = "QmTest123";
      const signature = await createValidSignature(user1, "daily", ipfsHash);
      
      await challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, ipfsHash, signature);
      
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");
      
      await expect(challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, ipfsHash, signature))
        .to.be.revertedWithCustomError(challengeRewards, "SignatureAlreadyUsed");
    });

    it("Should reject empty IPFS hashes", async function () {
      const signature = await createValidSignature(user1, "daily", "");
      
      await expect(challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, "", signature))
        .to.be.revertedWithCustomError(challengeRewards, "EmptyIPFSHash");
    });

    it("Should validate signature length", async function () {
      await expect(challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, "QmTest123", "0x1234"))
        .to.be.revertedWithCustomError(challengeRewards, "InvalidSignatureLength");
    });

    it("Should prevent reusing the same IPFS hash globally", async function () {
      const ipfsHash = "QmSameHash";
      const sigUser1Daily = await createValidSignature(user1, "daily", ipfsHash);

      // First claim with user1 daily
      await challengeRewards.connect(relayerSigner).completeDailyChallenge(user1.address, ipfsHash, sigUser1Daily);

      // Another user cannot reuse the same ipfsHash even for a different type
      const sigUser2Weekly = await createValidSignature(user2, "weekly", ipfsHash);
      await expect(challengeRewards.connect(relayerSigner).completeWeeklyChallenge(user2.address, ipfsHash, sigUser2Weekly))
        .to.be.revertedWithCustomError(challengeRewards, "IPFSHashAlreadyUsed");

      // Same user cannot reuse after cooldown either
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");
      const sigUser1Weekly = await createValidSignature(user1, "weekly", ipfsHash);
      await expect(challengeRewards.connect(relayerSigner).completeWeeklyChallenge(user1.address, ipfsHash, sigUser1Weekly))
        .to.be.revertedWithCustomError(challengeRewards, "IPFSHashAlreadyUsed");
    });
  });

  describe("Relayer Management", function () {
    it("Should allow owner to update relayer", async function () {
      await expect(challengeRewards.connect(owner).updateRelayer(user2.address))
        .to.emit(challengeRewards, "RelayerUpdated")
        .withArgs(relayerSigner.address, user2.address);
      
      expect(await challengeRewards.relayer()).to.equal(user2.address);
    });

    it("Should invalidate old signatures after signer update", async function () {
      const ipfsHash = "QmTest123";
      const oldSignature = await createValidSignature(user1, "daily", ipfsHash, relayerSigner);
      
      await challengeRewards.connect(owner).updateRelayer(user2.address);
      
      // Call using the new relayer (user2) so we pass the onlyRelayer check and hit signature verification
      await expect(challengeRewards.connect(user2).completeDailyChallenge(user1.address, ipfsHash, oldSignature))
        .to.be.revertedWithCustomError(challengeRewards, "InvalidSignature");
      
      const newSignature = await createValidSignature(user1, "daily", ipfsHash, user2);
      await expect(challengeRewards.connect(user2).completeDailyChallenge(user1.address, ipfsHash, newSignature))
        .to.emit(challengeRewards, "ChallengeCompleted");
    });

    it("Should reject unauthorized signer updates", async function () {
      await expect(challengeRewards.connect(user1).updateRelayer(user2.address))
        .to.be.revertedWithCustomError(challengeRewards, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero address as new signer", async function () {
      await expect(challengeRewards.connect(owner).updateRelayer(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(challengeRewards, "ZeroAddress");
    });
  });
});
