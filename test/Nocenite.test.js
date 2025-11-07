const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Nocenite Token", function () {
  let nocenite;
  let owner;
  let minter;
  let user;
  let unauthorized;

  // Deploy fresh contract before each test
  beforeEach(async function () {
    [owner, minter, user, unauthorized] = await ethers.getSigners();
    
    const NoceniteFactory = await ethers.getContractFactory("Nocenite");
    nocenite = await NoceniteFactory.deploy(owner.address);
    await nocenite.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should initialize with correct token details", async function () {
      expect(await nocenite.name()).to.equal("Nocenite");
      expect(await nocenite.symbol()).to.equal("NCT");
    });

    it("Should set the deployer as initial owner", async function () {
      expect(await nocenite.owner()).to.equal(owner.address);
    });

    it("Should start with no minter configured", async function () {
      expect(await nocenite.authorizedMinters(minter.address)).to.be.false;
    });

    it("Should start with ownership active", async function () {
      expect(await nocenite.ownershipRenounced()).to.be.false;
    });
  });

  describe("Minter Management", function () {
    it("Should allow owner to set authorized minter", async function () {
      await expect(nocenite.connect(owner).setMinter(minter.address, true))
        .to.emit(nocenite, "MinterUpdated")
        .withArgs(minter.address, true);
      
      expect(await nocenite.authorizedMinters(minter.address)).to.equal(true);
    });

    it("Should reject minter assignment from non-owner", async function () {
      await expect(nocenite.connect(unauthorized).setMinter(minter.address, true))
        .to.be.revertedWithCustomError(nocenite, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero address as minter", async function () {
      await expect(nocenite.connect(owner).setMinter(ethers.ZeroAddress, true))
        .to.be.revertedWithCustomError(nocenite, "CannotSetZeroAddressAsMinter");
    });

    it("Should prevent minter changes after ownership renouncement", async function () {
      await nocenite.connect(owner).setMinter(minter.address, true);
      await nocenite.connect(owner).renounceOwnership();
      
      await expect(nocenite.connect(owner).setMinter(user.address, true))
        .to.be.revertedWithCustomError(nocenite, "OwnableUnauthorizedAccount");
    });
  });

  describe("Token Minting", function () {
    // Set up authorized minter for all minting tests
    beforeEach(async function () {
      await nocenite.connect(owner).setMinter(minter.address, true);
    });

    it("Should allow authorized minter to mint tokens", async function () {
      const amount = ethers.parseEther("100");
      
      await nocenite.connect(minter).mint(user.address, amount);
      
      expect(await nocenite.balanceOf(user.address)).to.equal(amount);
      expect(await nocenite.totalSupply()).to.equal(amount);
    });

    it("Should reject minting from unauthorized addresses", async function () {
      const amount = ethers.parseEther("100");
      
      await expect(nocenite.connect(unauthorized).mint(user.address, amount))
        .to.be.revertedWithCustomError(nocenite, "OnlyMinterCanMint");
    });

    it("Should reject minting from owner without minter role", async function () {
      const amount = ethers.parseEther("100");
      
      await expect(nocenite.connect(owner).mint(user.address, amount))
        .to.be.revertedWithCustomError(nocenite, "OnlyMinterCanMint");
    });

    it("Should reject minting to zero address", async function () {
      const amount = ethers.parseEther("100");
      
      await expect(nocenite.connect(minter).mint(ethers.ZeroAddress, amount))
        .to.be.revertedWithCustomError(nocenite, "CannotMintToZeroAddress");
    });

    it("Should reject minting zero amount", async function () {
      await expect(nocenite.connect(minter).mint(user.address, 0))
        .to.be.revertedWithCustomError(nocenite, "AmountMustBeGreaterThanZero");
    });

    it("Should handle multiple mints correctly", async function () {
      const amount1 = ethers.parseEther("100");
      const amount2 = ethers.parseEther("200");
      
      await nocenite.connect(minter).mint(user.address, amount1);
      await nocenite.connect(minter).mint(user.address, amount2);
      
      expect(await nocenite.balanceOf(user.address)).to.equal(amount1 + amount2);
      expect(await nocenite.totalSupply()).to.equal(amount1 + amount2);
    });
  });

  describe("Ownership Renouncement", function () {
    it("Should allow ownership renouncement", async function () {
      await expect(nocenite.connect(owner).renounceOwnership())
        .to.emit(nocenite, "OwnershipRenounced");
      
      expect(await nocenite.owner()).to.equal(ethers.ZeroAddress);
      expect(await nocenite.ownershipRenounced()).to.be.true;
    });

    it("Should preserve minting functionality after renouncement", async function () {
      await nocenite.connect(owner).setMinter(minter.address, true);
      await nocenite.connect(owner).renounceOwnership();
      
      const amount = ethers.parseEther("100");
      await nocenite.connect(minter).mint(user.address, amount);
      
      expect(await nocenite.balanceOf(user.address)).to.equal(amount);
    });

    it("Should reject renouncement from non-owner", async function () {
      await nocenite.connect(owner).setMinter(minter.address, true);
      
      await expect(nocenite.connect(unauthorized).renounceOwnership())
        .to.be.revertedWithCustomError(nocenite, "OwnableUnauthorizedAccount");
    });
  });
});
