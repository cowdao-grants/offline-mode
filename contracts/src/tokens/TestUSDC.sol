// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solmate/tokens/ERC20.sol";

/// @title TestUSDC
/// @notice USDC with standard EIP-2612 permit (version "2" for mainnet compatibility)
/// @dev Only has EIP-2612 permit, NOT DAI-style permit (matches real USDC)
contract TestUSDC is ERC20 {
    /// @notice Returns the permit version for EIP-2612 compatibility
    /// @dev Real USDC on mainnet uses version "2"
    function version() external pure returns (string memory) {
        return "2";
    }

    /// @notice Override DOMAIN_SEPARATOR to always compute fresh
    /// @dev This is necessary because we copy bytecode to different addresses using anvil_setCode
    /// @dev Solmate's default caches INITIAL_DOMAIN_SEPARATOR from constructor, which breaks when bytecode is copied
    function DOMAIN_SEPARATOR() public view override returns (bytes32) {
        return computeDomainSeparator();
    }

    /// @notice Override computeDomainSeparator to use version "2" instead of Solmate's hardcoded "1"
    /// @dev Solmate's computeDomainSeparator has hardcoded version "1", but USDC uses "2"
    function computeDomainSeparator() internal view virtual override returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                    keccak256(bytes(name)),
                    keccak256("2"), // <-- version "2" for USDC (Solmate uses "1")
                    block.chainid,
                    address(this)
                )
            );
    }

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 initialSupply
    ) ERC20(name, symbol, decimals) {
        _mint(msg.sender, initialSupply);
    }

    /// @notice Mint tokens to an address (for testing)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Burn tokens from an address (for testing)
    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    // Note: Standard EIP-2612 permit is already implemented by Solmate's ERC20
    // Real USDC does NOT have DAI-style permit
}
