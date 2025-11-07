const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SocialRewards", function () {
  let socialRewards, nocenite, owner, relayer, user;

  beforeEach(async function () {
    [owner, relayer, user] = await ethers.getSigners();

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
      await socialRewards.updateRelayer(user.address);
      expect(await socialRewards.relayer()).to.equal(user.address);
    });

    it("Should revert if non-owner tries to update relayer", async function () {
      await expect(
        socialRewards.connect(user).updateRelayer(user.address)
      ).to.be.revertedWithCustomError(socialRewards, "OwnableUnauthorizedAccount");
    });

    it("Should revert if updating relayer to zero address", async function () {
      await expect(
        socialRewards.updateRelayer(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(socialRewards, "ZeroAddress");
    });
  });
});
