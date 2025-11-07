// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Nocenite.sol";

contract SocialRewards is Ownable {
    error ZeroAddress();
    error NotRelayer();
    error ArrayLengthMismatch();
    error BatchSizeExceedsLimit();
    
    Nocenite public immutable nocenite;
    address public relayer;
    
    uint256 public constant MAX_BATCH_SIZE = 500;
    
    mapping(bytes32 => bool) public processedInteractions;
    
    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }
    
    constructor(address _nocenite, address _relayer, address initialOwner) Ownable(initialOwner) {
        if (_nocenite == address(0) || _relayer == address(0)) {
            revert ZeroAddress();
        }
        nocenite = Nocenite(_nocenite);
        relayer = _relayer;
    }
    
    function updateRelayer(address _newRelayer) external onlyOwner {
        if (_newRelayer == address(0)) revert ZeroAddress();
        relayer = _newRelayer;
    }
    
    function batchRewardSocialInteractions(
        address[] calldata users,
        uint256[] calldata amounts,
        bytes32[] calldata interactionIds
    ) external onlyRelayer {
        if (users.length != amounts.length || amounts.length != interactionIds.length) {
            revert ArrayLengthMismatch();
        }
        if (users.length > MAX_BATCH_SIZE) {
            revert BatchSizeExceedsLimit();
        }
        
        for (uint256 i = 0; i < users.length;) {
            bytes32 id = interactionIds[i];
            if (!processedInteractions[id]) {
                processedInteractions[id] = true;
                nocenite.mint(users[i], amounts[i]);
            }
            unchecked { ++i; }
        }
    }
}
