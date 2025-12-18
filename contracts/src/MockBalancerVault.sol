// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal mock of Balancer Vault for offline CoW Protocol testing
contract MockBalancerVault {
    // Mapping: user => relayer => approved
    mapping(address => mapping(address => bool)) private _relayerApprovals;

    event RelayerApprovalChanged(address indexed relayer, address indexed sender, bool approved);

    function setRelayerApproval(address sender, address relayer, bool approved) external {
        _relayerApprovals[sender][relayer] = approved;
        emit RelayerApprovalChanged(relayer, sender, approved);
    }

    function hasApprovedRelayer(address user, address relayer) external view returns (bool) {
        return _relayerApprovals[user][relayer];
    }

    function getInternalBalance(address, address[] calldata)
        external
        pure
        returns (uint256[] memory)
    {
        return new uint256[](0);
    }
}
