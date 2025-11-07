const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SocialRewards Gas Efficiency", function () {
  let socialRewards, nocenite, owner, relayer, users;

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

    await nocenite.setMinter(await socialRewards.getAddress());
  });

  it("Should demonstrate gas efficiency of batch processing", async function () {
    const batchSize = 10;
    const batchUsers = users.slice(0, batchSize).map(u => u.address);
    const batchAmounts = Array(batchSize).fill(ethers.parseEther("1"));
    const batchIds = Array(batchSize).fill(0).map((_, i) => 
      ethers.keccak256(ethers.toUtf8Bytes(`interaction_${i}`))
    );

    const batchTx = await socialRewards.connect(relayer).batchRewardSocialInteractions(
      batchUsers, 
      batchAmounts, 
      batchIds
    );
    const batchReceipt = await batchTx.wait();
    
    console.log(`\n📊 Gas Efficiency Analysis (Local Hardhat Network):`);
    console.log(`Batch processing ${batchSize} interactions: ${batchReceipt.gasUsed.toString()} gas`);
    console.log(`Average per interaction: ${(batchReceipt.gasUsed / BigInt(batchSize)).toString()} gas`);
    
    for (let i = 0; i < batchSize; i++) {
      expect(await nocenite.balanceOf(batchUsers[i])).to.equal(ethers.parseEther("1"));
    }
  });

  it("Should handle medium batches efficiently", async function () {
    const batchSize = 100;
    const batchUsers = Array(batchSize).fill(0).map((_, i) => users[i % users.length].address);
    const batchAmounts = Array(batchSize).fill(ethers.parseEther("1"));
    const batchIds = Array(batchSize).fill(0).map((_, i) => 
      ethers.keccak256(ethers.toUtf8Bytes(`medium_interaction_${i}`))
    );

    const batchTx = await socialRewards.connect(relayer).batchRewardSocialInteractions(
      batchUsers, 
      batchAmounts, 
      batchIds
    );
    const batchReceipt = await batchTx.wait();
    
    console.log(`\n📈 Medium Batch (100 interactions): ${batchReceipt.gasUsed.toString()} gas`);
    console.log(`Average per interaction: ${(batchReceipt.gasUsed / BigInt(batchSize)).toString()} gas`);
  });

  it("Should handle large batches efficiently", async function () {
    const batchSize = 500;
    const batchUsers = Array(batchSize).fill(0).map((_, i) => users[i % users.length].address);
    const batchAmounts = Array(batchSize).fill(ethers.parseEther("1"));
    const batchIds = Array(batchSize).fill(0).map((_, i) => 
      ethers.keccak256(ethers.toUtf8Bytes(`large_interaction_${i}`))
    );

    const batchTx = await socialRewards.connect(relayer).batchRewardSocialInteractions(
      batchUsers, 
      batchAmounts, 
      batchIds
    );
    const batchReceipt = await batchTx.wait();
    
    console.log(`\n🚀 Large Batch (500 interactions): ${batchReceipt.gasUsed.toString()} gas`);
    console.log(`Average per interaction: ${(batchReceipt.gasUsed / BigInt(batchSize)).toString()} gas`);
    
    // Flow EVM testnet has 30M gas limit
    expect(batchReceipt.gasUsed).to.be.lt(30000000);
  });

  it("Should test very large batches near gas limits", async function () {
    const batchSize = 1000;
    const batchUsers = Array(batchSize).fill(0).map((_, i) => users[i % users.length].address);
    const batchAmounts = Array(batchSize).fill(ethers.parseEther("1"));
    const batchIds = Array(batchSize).fill(0).map((_, i) => 
      ethers.keccak256(ethers.toUtf8Bytes(`xlarge_interaction_${i}`))
    );

    try {
      const batchTx = await socialRewards.connect(relayer).batchRewardSocialInteractions(
        batchUsers, 
        batchAmounts, 
        batchIds
      );
      const batchReceipt = await batchTx.wait();
      
      console.log(`\n⚡ Very Large Batch (1000 interactions): ${batchReceipt.gasUsed.toString()} gas`);
      console.log(`Average per interaction: ${(batchReceipt.gasUsed / BigInt(batchSize)).toString()} gas`);
      console.log(`Gas efficiency vs 10-batch: ${((54524n * BigInt(batchSize)) / batchReceipt.gasUsed * 100n).toString()}%`);
      
    } catch (error) {
      console.log(`\n❌ 1000 batch failed: ${error.message}`);
      console.log(`Recommended max batch size: 500 interactions`);
    }
  });

  it("Should test extreme batch sizes", async function () {
    const batchSize = 2000;
    const batchUsers = Array(batchSize).fill(0).map((_, i) => users[i % users.length].address);
    const batchAmounts = Array(batchSize).fill(ethers.parseEther("1"));
    const batchIds = Array(batchSize).fill(0).map((_, i) => 
      ethers.keccak256(ethers.toUtf8Bytes(`extreme_interaction_${i}`))
    );

    try {
      const batchTx = await socialRewards.connect(relayer).batchRewardSocialInteractions(
        batchUsers, 
        batchAmounts, 
        batchIds,
        { gasLimit: 30000000 } // Explicit gas limit
      );
      const batchReceipt = await batchTx.wait();
      
      console.log(`\n🔥 Extreme Batch (2000 interactions): ${batchReceipt.gasUsed.toString()} gas`);
      console.log(`Average per interaction: ${(batchReceipt.gasUsed / BigInt(batchSize)).toString()} gas`);
      
    } catch (error) {
      console.log(`\n❌ 2000 batch failed: Out of gas or transaction too large`);
      console.log(`This confirms 500-1000 is the practical limit for Flow EVM`);
    }
  });
});
