// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Nocenite.sol";

contract SocialRewards is Ownable {
    error ZeroAddress();
    error NotRelayer();
    
    Nocenite public immutable nocenite;
    address public relayer;
    
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
}
