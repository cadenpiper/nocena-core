// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Nocenite (NCT)
 * @dev ERC20 token for the Nocena challenge completion platform
 * 
 * NCT tokens are earned by users completing daily, weekly, and monthly challenges.
 * The contract uses multiple authorized minters for different reward systems.
 * Ownership can be permanently renounced to achieve full decentralization.
 */
contract Nocenite is ERC20, Ownable {
    
    // Custom errors for gas efficiency
    error OnlyMinterCanMint();
    error CannotSetZeroAddressAsMinter();
    error CannotMintToZeroAddress();
    error AmountMustBeGreaterThanZero();
    error OwnershipAlreadyRenounced();
    
    /// @dev Tracks authorized minter contracts
    mapping(address => bool) public authorizedMinters;
    
    /// @dev Tracks if ownership has been permanently renounced
    bool public ownershipRenounced = false;
    
    /// @dev Emitted when a minter authorization is updated
    event MinterUpdated(address indexed minter, bool authorized);
    
    /// @dev Emitted when ownership is permanently renounced
    event OwnershipRenounced();
    
    /**
     * @dev Initializes the NCT token
     * @param initialOwner Address that will own the contract initially
     */
    constructor(address initialOwner) ERC20("Nocenite", "NCT") Ownable(initialOwner) {}
    
    /**
     * @dev Restricts function access to authorized minters only
     */
    modifier onlyMinter() {
        if (!authorizedMinters[msg.sender]) revert OnlyMinterCanMint();
        _;
    }
    
    /**
     * @dev Mints tokens to a specified address
     * @param to Address to receive the minted tokens
     * @param amount Amount of tokens to mint (in wei)
     */
    function mint(address to, uint256 amount) external onlyMinter {
        if (to == address(0)) revert CannotMintToZeroAddress();
        if (amount == 0) revert AmountMustBeGreaterThanZero();
        _mint(to, amount);
    }
    
    /**
     * @dev Authorizes or deauthorizes a minter contract
     * @param _minter Address of the minter contract
     * @param _authorized Whether to authorize or deauthorize
     */
    function setMinter(address _minter, bool _authorized) external onlyOwner {
        if (_minter == address(0)) revert CannotSetZeroAddressAsMinter();
        if (ownershipRenounced) revert OwnershipAlreadyRenounced();
        authorizedMinters[_minter] = _authorized;
        emit MinterUpdated(_minter, _authorized);
    }
    
    /**
     * @dev Legacy function for backward compatibility - authorizes a minter
     * @param _minter Address to authorize for minting tokens
     */
    function addMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert CannotSetZeroAddressAsMinter();
        if (ownershipRenounced) revert OwnershipAlreadyRenounced();
        authorizedMinters[_minter] = true;
        emit MinterUpdated(_minter, true);
    }
    
    /**
     * @dev Permanently renounces ownership, making the contract fully decentralized
     * @notice This action cannot be undone. Ensure minters are authorized before calling.
     */
    function renounceOwnership() public override onlyOwner {
        ownershipRenounced = true;
        super.renounceOwnership();
        emit OwnershipRenounced();
    }
}
