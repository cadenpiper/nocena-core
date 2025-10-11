const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChallengeRewards", function () {
  let nocenite;
  let challengeRewards;
  let owner;
  let backendSigner;
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
    [owner, backendSigner, user1, user2] = await ethers.getSigners();
    
    const NoceniteFactory = await ethers.getContractFactory("Nocenite");
    nocenite = await NoceniteFactory.deploy(owner.address);
    await nocenite.waitForDeployment();
    
    const ChallengeRewardsFactory = await ethers.getContractFactory("ChallengeRewards");
    challengeRewards = await ChallengeRewardsFactory.deploy(
      await nocenite.getAddress(),
      backendSigner.address,
      owner.address
    );
    await challengeRewards.waitForDeployment();
    
    // Set ChallengeRewards as authorized minter
    await nocenite.connect(owner).setMinter(await challengeRewards.getAddress());
  });

  // Helper function to create valid backend signatures
  async function createValidSignature(user, challengeType, ipfsHash, signer = backendSigner) {
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
      expect(await challengeRewards.backendSigner()).to.equal(backendSigner.address);
    });

    it("Should set correct reward amounts", async function () {
      expect(await challengeRewards.DAILY_REWARD()).to.equal(ethers.parseEther("100"));
      expect(await challengeRewards.WEEKLY_REWARD()).to.equal(ethers.parseEther("500"));
      expect(await challengeRewards.MONTHLY_REWARD()).to.equal(ethers.parseEther("2500"));
    });

    it("Should reject zero address parameters", async function () {
      const ChallengeRewardsFactory = await ethers.getContractFactory("ChallengeRewards");
      
      await expect(ChallengeRewardsFactory.deploy(ethers.ZeroAddress, backendSigner.address, owner.address))
        .to.be.revertedWithCustomError(challengeRewards, "ZeroAddress");
      
      await expect(ChallengeRewardsFactory.deploy(await nocenite.getAddress(), ethers.ZeroAddress, owner.address))
        .to.be.revertedWithCustomError(challengeRewards, "ZeroAddress");
      
      await expect(ChallengeRewardsFactory.deploy(await nocenite.getAddress(), backendSigner.address, ethers.ZeroAddress))
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
          
          await expect(challengeRewards.connect(user1)[func](ipfsHash, signature))
            .to.emit(challengeRewards, "ChallengeCompleted")
            .withArgs(user1.address, name, ethers.parseEther(reward), ipfsHash);
          
          expect(await nocenite.balanceOf(user1.address)).to.equal(ethers.parseEther(reward));
        });

        it(`Should enforce ${name} cooldown period`, async function () {
          const ipfsHash1 = `Qm${name}123`;
          const signature1 = await createValidSignature(user1, name, ipfsHash1);
          
          await challengeRewards.connect(user1)[func](ipfsHash1, signature1);
          
          const ipfsHash2 = `Qm${name}456`;
          const signature2 = await createValidSignature(user1, name, ipfsHash2);
          
          await expect(challengeRewards.connect(user1)[func](ipfsHash2, signature2))
            .to.be.revertedWithCustomError(challengeRewards, "CooldownActive");
        });

        it(`Should allow ${name} challenge after cooldown expires`, async function () {
          const ipfsHash1 = `Qm${name}123`;
          const signature1 = await createValidSignature(user1, name, ipfsHash1);
          
          await challengeRewards.connect(user1)[func](ipfsHash1, signature1);
          
          await ethers.provider.send("evm_increaseTime", [duration]);
          await ethers.provider.send("evm_mine");
          
          const ipfsHash2 = `Qm${name}456`;
          const signature2 = await createValidSignature(user1, name, ipfsHash2);
          
          await expect(challengeRewards.connect(user1)[func](ipfsHash2, signature2))
            .to.emit(challengeRewards, "ChallengeCompleted");
        });
      });
    });

    it("Should track last claim timestamps correctly", async function () {
      const ipfsHash = "QmTest123";
      const signature = await createValidSignature(user1, "daily", ipfsHash);
      
      const tx = await challengeRewards.connect(user1).completeDailyChallenge(ipfsHash, signature);
      const block = await ethers.provider.getBlock(tx.blockNumber);
      
      expect(await challengeRewards.lastClaim(user1.address, "daily")).to.equal(block.timestamp);
    });

    it("Should allow multiple challenge types on same day", async function () {
      const signatures = await Promise.all(challengeTypes.map(({ name }) => 
        createValidSignature(user1, name, `Qm${name}123`)
      ));
      
      for (let i = 0; i < challengeTypes.length; i++) {
        await challengeRewards.connect(user1)[challengeTypes[i].func](`Qm${challengeTypes[i].name}123`, signatures[i]);
      }
      
      expect(await nocenite.balanceOf(user1.address)).to.equal(ethers.parseEther("3100"));
    });

    it("Should handle multiple users independently", async function () {
      const ipfsHash1 = "QmTest123";
      const signature1 = await createValidSignature(user1, "daily", ipfsHash1);
      
      const ipfsHash2 = "QmTest456";
      const signature2 = await createValidSignature(user2, "daily", ipfsHash2);
      
      await challengeRewards.connect(user1).completeDailyChallenge(ipfsHash1, signature1);
      await challengeRewards.connect(user2).completeDailyChallenge(ipfsHash2, signature2);
      
      expect(await nocenite.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
      expect(await nocenite.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Security Validation", function () {
    it("Should reject invalid signatures", async function () {
      const ipfsHash = "QmTest123";
      const signature = await createValidSignature(user1, "daily", ipfsHash, user2);
      
      await expect(challengeRewards.connect(user1).completeDailyChallenge(ipfsHash, signature))
        .to.be.revertedWithCustomError(challengeRewards, "InvalidSignature");
    });

    it("Should prevent signature replay attacks", async function () {
      const ipfsHash = "QmTest123";
      const signature = await createValidSignature(user1, "daily", ipfsHash);
      
      await challengeRewards.connect(user1).completeDailyChallenge(ipfsHash, signature);
      
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");
      
      await expect(challengeRewards.connect(user1).completeDailyChallenge(ipfsHash, signature))
        .to.be.revertedWithCustomError(challengeRewards, "SignatureAlreadyUsed");
    });

    it("Should reject empty IPFS hashes", async function () {
      const signature = await createValidSignature(user1, "daily", "");
      
      await expect(challengeRewards.connect(user1).completeDailyChallenge("", signature))
        .to.be.revertedWithCustomError(challengeRewards, "EmptyIPFSHash");
    });

    it("Should validate signature length", async function () {
      await expect(challengeRewards.connect(user1).completeDailyChallenge("QmTest123", "0x1234"))
        .to.be.revertedWithCustomError(challengeRewards, "InvalidSignatureLength");
    });
  });

  describe("Backend Signer Management", function () {
    it("Should allow owner to update backend signer", async function () {
      await expect(challengeRewards.connect(owner).updateBackendSigner(user2.address))
        .to.emit(challengeRewards, "BackendSignerUpdated")
        .withArgs(backendSigner.address, user2.address);
      
      expect(await challengeRewards.backendSigner()).to.equal(user2.address);
    });

    it("Should invalidate old signatures after signer update", async function () {
      const ipfsHash = "QmTest123";
      const oldSignature = await createValidSignature(user1, "daily", ipfsHash, backendSigner);
      
      await challengeRewards.connect(owner).updateBackendSigner(user2.address);
      
      await expect(challengeRewards.connect(user1).completeDailyChallenge(ipfsHash, oldSignature))
        .to.be.revertedWithCustomError(challengeRewards, "InvalidSignature");
      
      const newSignature = await createValidSignature(user1, "daily", ipfsHash, user2);
      await expect(challengeRewards.connect(user1).completeDailyChallenge(ipfsHash, newSignature))
        .to.emit(challengeRewards, "ChallengeCompleted");
    });

    it("Should reject unauthorized signer updates", async function () {
      await expect(challengeRewards.connect(user1).updateBackendSigner(user2.address))
        .to.be.revertedWithCustomError(challengeRewards, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero address as new signer", async function () {
      await expect(challengeRewards.connect(owner).updateBackendSigner(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(challengeRewards, "ZeroAddress");
    });
  });
});
