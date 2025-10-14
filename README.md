# Nocena Core

Smart contracts for the Nocena challenge completion platform.

## Setup

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Environment

Create `.env` file:
```bash
PRIVATE_KEY=0x_your_private_key_here
```

## Contracts

### Nocenite (NCT)
ERC20 token earned through challenge completions.
- **Symbol:** NCT
- **Decimals:** 18
- **Minting:** Authorized minter only
- **Ownership:** Automatically renounced after deployment

### ChallengeRewards
Manages reward distribution for AI-verified challenges.
- **Daily:** 100 NCT (24h cooldown)
- **Weekly:** 500 NCT (7d cooldown) 
- **Monthly:** 2500 NCT (30d cooldown)
- **Security:** Backend-signed proofs, replay protection, reentrancy protection

## Usage

```solidity
// Complete daily challenge
challengeRewards.completeDailyChallenge(ipfsHash, signature);

// Complete weekly challenge  
challengeRewards.completeWeeklyChallenge(ipfsHash, signature);

// Complete monthly challenge
challengeRewards.completeMonthlyChallenge(ipfsHash, signature);
```

## Testing

```bash
npx hardhat test                              # Run all tests
npx hardhat test test/Nocenite.test.js        # Test NCT token
npx hardhat test test/ChallengeRewards.test.js # Test rewards
```

## Deployment

### Local Testing
```bash
npx hardhat node                              # Start local node
npx hardhat run scripts/deploy.js --network localhost
```

### Flow EVM Testnet
```bash
npx hardhat run scripts/deploy.js --network flowTestnet
```

The deployment script automatically:
1. Deploys Nocenite with deployer as owner
2. Deploys ChallengeRewards with backend signer and deployer as owner
3. Sets ChallengeRewards as authorized minter on Nocenite
4. Renounces Nocenite ownership for full decentralization
