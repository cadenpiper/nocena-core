# Nocena Core

Smart contracts for the Nocena challenge completion platform.

## Setup

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Contracts

### Nocenite (NCT)
ERC20 token earned through challenge completions.
- **Symbol:** NCT
- **Decimals:** 18
- **Minting:** Authorized minter only
- **Ownership:** Renounceable after minter set

### ChallengeRewards
Manages reward distribution for AI-verified challenges.
- **Daily:** 100 NCT (24h cooldown)
- **Weekly:** 500 NCT (7d cooldown) 
- **Monthly:** 2500 NCT (30d cooldown)
- **Security:** Backend-signed proofs, replay protection

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
npx hardhat test                    # Run all tests
npx hardhat test test/Nocenite.test.js     # Test NCT token
npx hardhat test test/ChallengeRewards.test.js  # Test rewards
```
