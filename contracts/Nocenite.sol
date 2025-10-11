// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Nocenite (NCT)
 * @dev ERC20 token for the Nocena challenge completion platform
 * 
 * NCT tokens are earned by users completing daily, weekly, and monthly challenges.
 * The contract uses a single authorized minter pattern for security and gas efficiency.
 * Ownership can be permanently renounced to achieve full decentralization.
 */
contract Nocenite is ERC20, Ownable {
    
    // Custom errors for gas efficiency
    error OnlyMinterCanMint();
    error CannotSetZeroAddressAsMinter();
    error CannotMintToZeroAddress();
    error AmountMustBeGreaterThanZero();
    error OwnershipAlreadyRenounced();
    error MustSetMinterFirst();
    
    /// @dev Address authorized to mint tokens (typically the NocenaCore contract)
    address public minter;
    
    /// @dev Tracks if ownership has been permanently renounced
    bool public ownershipRenounced = false;
    
    /// @dev Emitted when the authorized minter is updated
    event MinterSet(address indexed minter);
    
    /// @dev Emitted when ownership is permanently renounced
    event OwnershipRenounced();
    
    /**
     * @dev Initializes the NCT token
     * @param initialOwner Address that will own the contract initially
     */
    constructor(address initialOwner) ERC20("Nocenite", "NCT") Ownable(initialOwner) {}
    
    /**
     * @dev Restricts function access to the authorized minter only
     */
    modifier onlyMinter() {
        if (msg.sender != minter) revert OnlyMinterCanMint();
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
     * @dev Sets the authorized minter address
     * @param _minter Address to authorize for minting tokens
     */
    function setMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert CannotSetZeroAddressAsMinter();
        if (ownershipRenounced) revert OwnershipAlreadyRenounced();
        minter = _minter;
        emit MinterSet(_minter);
    }
    
    /**
     * @dev Permanently renounces ownership, making the contract fully decentralized
     * @notice This action cannot be undone. Ensure minter is set before calling.
     */
    function renounceOwnership() public override onlyOwner {
        if (minter == address(0)) revert MustSetMinterFirst();
        ownershipRenounced = true;
        super.renounceOwnership();
        emit OwnershipRenounced();
    }
}
