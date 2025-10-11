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
 * Users earn NCT tokens by completing AI-verified challenges with backend-signed proofs.
 * Supports daily (100 NCT), weekly (500 NCT), and monthly (2500 NCT) challenges.
 * Each challenge type has independent cooldown periods to prevent abuse.
 * Backend signer can be rotated by owner for security purposes.
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
    
    /// @dev The NCT token contract for minting rewards
    Nocenite public immutable nocenite;
    
    /// @dev Address authorized to sign challenge completion proofs
    address public backendSigner;
    
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
    
    /// @dev Emitted when a user successfully completes a challenge
    event ChallengeCompleted(address indexed user, string indexed challengeType, uint256 reward, string ipfsHash);
    
    /// @dev Emitted when the backend signer is updated by owner
    event BackendSignerUpdated(address indexed oldSigner, address indexed newSigner);
    
    /**
     * @dev Initializes the ChallengeRewards contract
     * @param _nocenite Address of the NCT token contract
     * @param _backendSigner Address authorized to sign challenge completion proofs
     * @param initialOwner Address that will own the contract initially
     */
    constructor(address _nocenite, address _backendSigner, address initialOwner) Ownable(initialOwner) {
        if (_nocenite == address(0) || _backendSigner == address(0)) {
            revert ZeroAddress();
        }
        nocenite = Nocenite(_nocenite);
        backendSigner = _backendSigner;
    }
    
    /**
     * @dev Completes a daily challenge and mints 100 NCT tokens
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Backend signature verifying challenge completion
     */
    function completeDailyChallenge(string calldata ipfsHash, bytes calldata signature) external nonReentrant {
        _completeChallenge("daily", DAY_DURATION, DAILY_REWARD, ipfsHash, signature);
    }
    
    /**
     * @dev Completes a weekly challenge and mints 500 NCT tokens
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Backend signature verifying challenge completion
     */
    function completeWeeklyChallenge(string calldata ipfsHash, bytes calldata signature) external nonReentrant {
        _completeChallenge("weekly", WEEK_DURATION, WEEKLY_REWARD, ipfsHash, signature);
    }
    
    /**
     * @dev Completes a monthly challenge and mints 2500 NCT tokens
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Backend signature verifying challenge completion
     */
    function completeMonthlyChallenge(string calldata ipfsHash, bytes calldata signature) external nonReentrant {
        _completeChallenge("monthly", MONTH_DURATION, MONTHLY_REWARD, ipfsHash, signature);
    }
    
    /**
     * @dev Internal function to process challenge completion
     * @param challengeType Type of challenge ("daily", "weekly", "monthly")
     * @param duration Cooldown duration for this challenge type
     * @param reward Amount of NCT tokens to mint as reward
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Backend signature verifying challenge completion
     */
    function _completeChallenge(
        string memory challengeType,
        uint256 duration,
        uint256 reward,
        string calldata ipfsHash,
        bytes calldata signature
    ) internal {
        if (bytes(ipfsHash).length == 0) revert EmptyIPFSHash();
        if (signature.length != 65) revert InvalidSignatureLength();
        if (block.timestamp < lastClaim[msg.sender][challengeType] + duration) revert CooldownActive();
        
        _verifyCompletion(msg.sender, challengeType, ipfsHash, signature);
        
        lastClaim[msg.sender][challengeType] = block.timestamp;
        nocenite.mint(msg.sender, reward);
        
        emit ChallengeCompleted(msg.sender, challengeType, reward, ipfsHash);
    }
    
    /**
     * @dev Updates the backend signer address (owner only)
     * @param newSigner New address authorized to sign challenge completion proofs
     */
    function updateBackendSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address oldSigner = backendSigner;
        backendSigner = newSigner;
        emit BackendSignerUpdated(oldSigner, newSigner);
    }
    
    /**
     * @dev Verifies the authenticity of a challenge completion signature
     * @param user Address of the user completing the challenge
     * @param challengeType Type of challenge being completed
     * @param ipfsHash IPFS hash of the challenge completion proof
     * @param signature Backend signature to verify
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
        if (ethSignedMessageHash.recover(signature) != backendSigner) revert InvalidSignature();
        
        // Then check if already used
        if (usedSignatures[ethSignedMessageHash]) revert SignatureAlreadyUsed();
        
        usedSignatures[ethSignedMessageHash] = true;
    }
}
