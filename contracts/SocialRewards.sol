// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Nocenite.sol";

/**
 * @title SocialRewards
 * @dev Manages reward distribution for social interactions on Nocena platform
 * 
 * Users earn NCT tokens for social interactions: likes (1 NCT), comments (3 NCT), reactions (2 NCT).
 * Batch processing optimizes gas costs while preventing double-minting through interaction tracking.
 * Relayer can be rotated by owner for security purposes.
 */
contract SocialRewards is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    
    // Custom errors for gas efficiency
    error ZeroAddress();
    error NotRelayer();
    error ArrayLengthMismatch();
    error BatchSizeExceedsLimit();
    error InvalidSignature();
    error SignatureAlreadyUsed();
    error InvalidSignatureLength();
    error AmountExceedsMaximum();
    
    /// @dev The NCT token contract for minting rewards
    Nocenite public immutable nocenite;
    
    /// @dev Address authorized to relay signed social interaction proofs
    address public relayer;
    
    /// @dev Maximum batch size for gas efficiency (500 interactions)
    uint256 public constant MAX_BATCH_SIZE = 500;
    
    /// @dev Maximum reward amount per interaction (10 NCT)
    uint256 public constant MAX_INTERACTION_REWARD = 10e18;
    
    /// @dev Tracks processed interactions to prevent double-minting
    mapping(bytes32 => bool) public processedInteractions;
    
    /// @dev Prevents signature replay attacks by tracking used signature hashes
    mapping(bytes32 => bool) public usedSignatures;
    
    /// @dev Emitted when social interactions are batch processed
    event SocialRewardsBatched(uint256 count, uint256 totalRewards);
    
    /// @dev Emitted when the relayer is updated by owner
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    
    /// @dev Restricts functions to be callable only by the relayer
    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }
    
    /**
     * @dev Initializes the SocialRewards contract
     * @param _nocenite Address of the NCT token contract
     * @param _relayer Address authorized to relay social interaction proofs
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
     * @dev Updates the relayer address (owner only)
     * @param _newRelayer New relayer address
     */
    function updateRelayer(address _newRelayer) external onlyOwner {
        if (_newRelayer == address(0)) revert ZeroAddress();
        address oldRelayer = relayer;
        relayer = _newRelayer;
        emit RelayerUpdated(oldRelayer, _newRelayer);
    }
    
    /**
     * @dev Batch processes social interaction rewards with signature verification
     * @param users Array of user addresses to reward
     * @param amounts Array of reward amounts (in wei)
     * @param interactionIds Array of unique interaction identifiers
     * @param signature Relayer signature verifying the batch data
     */
    function batchRewardSocialInteractions(
        address[] calldata users,
        uint256[] calldata amounts,
        bytes32[] calldata interactionIds,
        bytes calldata signature
    ) external nonReentrant onlyRelayer {
        if (users.length != amounts.length || amounts.length != interactionIds.length) {
            revert ArrayLengthMismatch();
        }
        if (users.length > MAX_BATCH_SIZE) {
            revert BatchSizeExceedsLimit();
        }
        if (signature.length != 65) {
            revert InvalidSignatureLength();
        }
        
        _verifyBatchSignature(users, amounts, interactionIds, signature);
        
        uint256 totalRewards = 0;
        
        for (uint256 i = 0; i < users.length;) {
            address user = users[i];
            uint256 amount = amounts[i];
            bytes32 id = interactionIds[i];
            
            // Validate user and amount
            if (user == address(0)) revert ZeroAddress();
            if (amount == 0 || amount > MAX_INTERACTION_REWARD) revert AmountExceedsMaximum();
            
            // Process interaction if not already processed
            if (!processedInteractions[id]) {
                processedInteractions[id] = true;
                nocenite.mint(user, amount);
                unchecked { totalRewards += amount; }
            }
            
            unchecked { ++i; }
        }
        
        emit SocialRewardsBatched(users.length, totalRewards);
    }
    
    /**
     * @dev Verifies the authenticity of a batch signature
     * @param users Array of user addresses
     * @param amounts Array of reward amounts
     * @param interactionIds Array of interaction identifiers
     * @param signature Relayer signature to verify
     */
    function _verifyBatchSignature(
        address[] calldata users,
        uint256[] calldata amounts,
        bytes32[] calldata interactionIds,
        bytes calldata signature
    ) internal {
        bytes32 messageHash = keccak256(abi.encode(users, amounts, interactionIds));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        
        // Verify signature authenticity FIRST
        if (ethSignedMessageHash.recover(signature) != relayer) revert InvalidSignature();
        
        // Then check if already used
        if (usedSignatures[ethSignedMessageHash]) revert SignatureAlreadyUsed();
        
        usedSignatures[ethSignedMessageHash] = true;
    }
}
