const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SocialRewards Gas Efficiency", function () {
  let socialRewards, nocenite, owner, relayer, users;

  async function createSignature(users, amounts, interactionIds, signer) {
    const messageHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "bytes32[]"],
      [users, amounts, interactionIds]
    ));
    return await signer.signMessage(ethers.getBytes(messageHash));
  }

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [owner, relayer, ...users] = signers;

    const Nocenite = await ethers.getContractFactory("Nocenite");
    nocenite = await Nocenite.deploy(owner.address);

    const SocialRewards = await ethers.getContractFactory("SocialRewards");
    socialRewards = await SocialRewards.deploy(
      await nocenite.getAddress(),
      relayer.address,
      owner.address
    );

    await nocenite.setMinter(await socialRewards.getAddress(), true);
  });

  it("Should demonstrate gas efficiency of batch processing", async function () {
    const batchSize = 10;
    const batchUsers = users.slice(0, batchSize).map(u => u.address);
    const batchAmounts = Array(batchSize).fill(ethers.parseEther("1"));
    const batchIds = Array(batchSize).fill(0).map((_, i) => 
      ethers.keccak256(ethers.toUtf8Bytes(`interaction_${i}`))
    );

    const signature = await createSignature(batchUsers, batchAmounts, batchIds, relayer);

    const batchTx = await socialRewards.connect(relayer).batchRewardSocialInteractions(
      batchUsers, 
      batchAmounts, 
      batchIds,
      signature
    );
    const batchReceipt = await batchTx.wait();
    
    console.log(`\n📊 Gas Efficiency Analysis (Local Hardhat Network):`);
    console.log(`Batch processing ${batchSize} interactions: ${batchReceipt.gasUsed.toString()} gas`);
    console.log(`Average per interaction: ${(batchReceipt.gasUsed / BigInt(batchSize)).toString()} gas`);
    
    for (let i = 0; i < batchSize; i++) {
      expect(await nocenite.balanceOf(batchUsers[i])).to.equal(ethers.parseEther("1"));
    }
  });

  it("Should handle large batches efficiently", async function () {
    const batchSize = 500;
    const batchUsers = Array(batchSize).fill(0).map((_, i) => users[i % users.length].address);
    const batchAmounts = Array(batchSize).fill(ethers.parseEther("1"));
    const batchIds = Array(batchSize).fill(0).map((_, i) => 
      ethers.keccak256(ethers.toUtf8Bytes(`large_interaction_${i}`))
    );

    const signature = await createSignature(batchUsers, batchAmounts, batchIds, relayer);

    const batchTx = await socialRewards.connect(relayer).batchRewardSocialInteractions(
      batchUsers, 
      batchAmounts, 
      batchIds,
      signature
    );
    const batchReceipt = await batchTx.wait();
    
    console.log(`\n🚀 Large Batch (500 interactions): ${batchReceipt.gasUsed.toString()} gas`);
    console.log(`Average per interaction: ${(batchReceipt.gasUsed / BigInt(batchSize)).toString()} gas`);
    
    expect(batchReceipt.gasUsed).to.be.lt(30000000);
  });
});
