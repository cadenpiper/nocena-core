// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Nocenite.sol";

/**
 * @title ChallengeRewards
 * @dev Manages reward distribution for Nocena platform challenge completions
 * 
 * Users earn NCT tokens by completing AI-verified challenges with relayer-signed proofs.
 * Supports daily (100 NCT), weekly (500 NCT), and monthly (2500 NCT) challenges.
 * Each challenge type has independent cooldown periods to prevent abuse.
 * Relayer can be rotated by owner for security purposes.
 */
contract ChallengeRewards is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    
    // Custom errors for gas efficiency
    error CooldownActive();
    error SignatureAlreadyUsed();
    error InvalidSignature();
    error EmptyIPFSHash();
    error InvalidSignatureLength();
    error ZeroAddress();
    error NotRelayer();
    error IPFSHashAlreadyUsed();
    error AmountExceedsMaximum();
    error SelfReferentialChallenge();
    
    /// @dev The NCT token contract for minting rewards
    Nocenite public immutable nocenite;
    
    /// @dev Address authorized to relay signed challenge completion proofs
    address public relayer;
    
    /// @dev Reward amount for daily challenges (100 NCT)
    uint256 public constant DAILY_REWARD = 100e18;
    
    /// @dev Reward amount for weekly challenges (500 NCT)
    uint256 public constant WEEKLY_REWARD = 500e18;
    
    /// @dev Reward amount for monthly challenges (2500 NCT)
    uint256 public constant MONTHLY_REWARD = 2500e18;
    
    /// @dev Cooldown period for daily challenges (24 hours)
    uint256 public constant DAY_DURATION = 1 days;
    
    /// @dev Cooldown period for weekly challenges (7 days)
    uint256 public constant WEEK_DURATION = 7 days;
    
    /// @dev Cooldown period for monthly challenges (30 days)
    uint256 public constant MONTH_DURATION = 30 days;
    
    /// @dev Tracks last claim timestamp per user per challenge type
    mapping(address => mapping(string => uint256)) public lastClaim;
    
    /// @dev Prevents signature replay attacks by tracking used signature hashes
    mapping(bytes32 => bool) public usedSignatures;
    
    /// @dev Prevents reusing the same IPFS hash across users and challenge types
    mapping(bytes32 => bool) public usedIPFSHashes;
    
    /// @dev Emitted when a user successfully completes a challenge
    event ChallengeCompleted(address indexed user, string indexed challengeType, uint256 reward, string ipfsHash);
    
    /// @dev Emitted when the relayer is updated by owner
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    
    /// @dev Restricts functions to be callable only by the relayer
    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }
    
    /**
     * @dev Initializes the ChallengeRewards contract
     * @param _nocenite Address of the NCT token contract
     * @param _relayer Address authorized to relay challenge completion proofs
     * @param initialOwner Address that will own the contract initially
     */
    constructor(address _nocenite, address _relayer, address initialOwner) Ownable(initialOwner) {
        if (_nocenite == address(0) || _relayer == address(0)) {
            revert ZeroAddress();
        }
        nocenite = Nocenite(_nocenite);
        relayer = _relayer;
    }
    
    /**
     * @dev Completes a daily challenge for a user and mints 100 NCT tokens
     * @param user Address of the user who completed the challenge
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Relayer signature verifying challenge completion
     */
    function completeDailyChallenge(address user, string calldata ipfsHash, bytes calldata signature) external nonReentrant onlyRelayer {
        _completeChallenge(user, "daily", DAY_DURATION, DAILY_REWARD, ipfsHash, signature);
    }
    
    /**
     * @dev Completes a weekly challenge for a user and mints 500 NCT tokens
     * @param user Address of the user who completed the challenge
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Relayer signature verifying challenge completion
     */
    function completeWeeklyChallenge(address user, string calldata ipfsHash, bytes calldata signature) external nonReentrant onlyRelayer {
        _completeChallenge(user, "weekly", WEEK_DURATION, WEEKLY_REWARD, ipfsHash, signature);
    }
    
    /**
     * @dev Completes a monthly challenge for a user and mints 2500 NCT tokens
     * @param user Address of the user who completed the challenge
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Relayer signature verifying challenge completion
     */
    function completeMonthlyChallenge(address user, string calldata ipfsHash, bytes calldata signature) external nonReentrant onlyRelayer {
        _completeChallenge(user, "monthly", MONTH_DURATION, MONTHLY_REWARD, ipfsHash, signature);
    }
    
    /**
     * @dev Completes a private challenge with automatic 10% creator bonus
     * @param recipient Address of the user who completed the challenge
     * @param creator Address of the user who created the challenge
     * @param recipientAmount Amount of NCT tokens to mint to recipient (max 250 NCT)
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Relayer signature verifying challenge completion
     */
    function completePrivateChallenge(
        address recipient, 
        address creator, 
        uint256 recipientAmount, 
        string calldata ipfsHash, 
        bytes calldata signature
    ) external nonReentrant onlyRelayer {
        if (bytes(ipfsHash).length == 0) revert EmptyIPFSHash();
        if (signature.length != 65) revert InvalidSignatureLength();
        if (recipient == address(0) || creator == address(0)) revert ZeroAddress();
        if (recipientAmount == 0 || recipientAmount > 250e18) revert AmountExceedsMaximum();
        if (recipient == creator) revert SelfReferentialChallenge();
        
        // Calculate 10% creator bonus with better precision
        uint256 creatorAmount = (recipientAmount * 10) / 100;
        
        // Verify signature for the dual minting
        _verifyCompletion(recipient, "private", ipfsHash, signature);
        
        // Prevent global reuse of the same IPFS hash
        bytes32 ipfsKey = keccak256(bytes(ipfsHash));
        if (usedIPFSHashes[ipfsKey]) revert IPFSHashAlreadyUsed();
        usedIPFSHashes[ipfsKey] = true;
        
        // Mint to both recipient and creator
        nocenite.mint(recipient, recipientAmount);
        nocenite.mint(creator, creatorAmount);
        
        emit ChallengeCompleted(recipient, "private", recipientAmount, ipfsHash);
        emit ChallengeCompleted(creator, "private-creator", creatorAmount, ipfsHash);
    }
    
    /**
     * @dev Completes a public challenge with variable reward amount
     * @param user Address of the user who completed the challenge
     * @param rewardAmount Amount of NCT tokens to mint
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Relayer signature verifying challenge completion
     */
    function completePublicChallenge(
        address user,
        uint256 rewardAmount,
        string calldata ipfsHash,
        bytes calldata signature
    ) external nonReentrant onlyRelayer {
        if (bytes(ipfsHash).length == 0) revert EmptyIPFSHash();
        if (signature.length != 65) revert InvalidSignatureLength();
        if (user == address(0)) revert ZeroAddress();
        if (rewardAmount == 0 || rewardAmount > 1000e18) revert AmountExceedsMaximum();
        
        _verifyCompletion(user, "public", ipfsHash, signature);
        
        bytes32 ipfsKey = keccak256(bytes(ipfsHash));
        if (usedIPFSHashes[ipfsKey]) revert IPFSHashAlreadyUsed();
        usedIPFSHashes[ipfsKey] = true;
        
        nocenite.mint(user, rewardAmount);
        
        emit ChallengeCompleted(user, "public", rewardAmount, ipfsHash);
    }
    
    /**
     * @dev Internal function to process challenge completion
     * @param challengeType Type of challenge ("daily", "weekly", "monthly")
     * @param duration Cooldown duration for this challenge type
     * @param reward Amount of NCT tokens to mint as reward
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Relayer signature verifying challenge completion
     */
    function _completeChallenge(
        address user,
        string memory challengeType,
        uint256 duration,
        uint256 reward,
        string calldata ipfsHash,
        bytes calldata signature
    ) internal {
        if (bytes(ipfsHash).length == 0) revert EmptyIPFSHash();
        if (signature.length != 65) revert InvalidSignatureLength();
        if (user == address(0)) revert ZeroAddress();
        if (block.timestamp < lastClaim[user][challengeType] + duration) revert CooldownActive();
        
        _verifyCompletion(user, challengeType, ipfsHash, signature);
        
        // Prevent global reuse of the same IPFS hash across all users/types
        bytes32 ipfsKey = keccak256(bytes(ipfsHash));
        if (usedIPFSHashes[ipfsKey]) revert IPFSHashAlreadyUsed();
        usedIPFSHashes[ipfsKey] = true;
        
        lastClaim[user][challengeType] = block.timestamp;
        nocenite.mint(user, reward);
        
        emit ChallengeCompleted(user, challengeType, reward, ipfsHash);
    }
    
    /**
     * @dev Updates the relayer address (owner only)
     * @param newRelayer New address authorized to relay challenge completion proofs
     */
    function updateRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        address oldRelayer = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(oldRelayer, newRelayer);
    }
    
    /**
     * @dev Verifies the authenticity of a challenge completion signature
     * @param user Address of the user completing the challenge
     * @param challengeType Type of challenge being completed
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Relayer signature to verify
     */
    function _verifyCompletion(
        address user,
        string memory challengeType,
        string calldata ipfsHash,
        bytes calldata signature
    ) internal {
        bytes32 messageHash = keccak256(abi.encode(user, challengeType, ipfsHash));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        
        // Verify signature authenticity FIRST
        if (ethSignedMessageHash.recover(signature) != relayer) revert InvalidSignature();
        
        // Then check if already used
        if (usedSignatures[ethSignedMessageHash]) revert SignatureAlreadyUsed();
        
        usedSignatures[ethSignedMessageHash] = true;
    }
}
