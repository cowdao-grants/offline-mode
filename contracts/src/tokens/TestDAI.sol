// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solmate/tokens/ERC20.sol";

/// @title TestDAI
/// @notice DAI token with DAI-style permit for testing
/// @dev Extends Solmate's ERC20 which already has EIP-2612 permit
/// @dev Adds DAI's custom permit with bool allowed parameter
contract TestDAI is ERC20 {
    // keccak256("Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)")
    bytes32 public constant PERMIT_TYPEHASH_DAI = 0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb;

    /// @notice Returns the permit version for EIP-2612 compatibility
    /// @dev Must match the version used in Solmate's computeDomainSeparator (hardcoded as "1")
    function version() external pure virtual returns (string memory) {
        return "1";
    }

    /// @notice Override DOMAIN_SEPARATOR to always compute fresh
    /// @dev This is necessary because we copy bytecode to different addresses using anvil_setCode
    /// @dev Solmate's default caches INITIAL_DOMAIN_SEPARATOR from constructor, which breaks when bytecode is copied
    function DOMAIN_SEPARATOR() public view override returns (bytes32) {
        return computeDomainSeparator();
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

    /// @notice DAI-style permit with bool allowed parameter
    /// @dev This is the permit signature that DAI uses (different from EIP-2612)
    /// @dev Uses the same nonces mapping as EIP-2612 permit
    function permit(
        address holder,
        address spender,
        uint256 nonce,
        uint256 expiry,
        bool allowed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= expiry, "permit-expired");
        require(holder != address(0), "invalid-holder");
        require(nonce == nonces[holder]++, "invalid-nonce");

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR(),
                keccak256(abi.encode(PERMIT_TYPEHASH_DAI, holder, spender, nonce, expiry, allowed))
            )
        );

        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == holder, "invalid-signature");

        uint256 amount = allowed ? type(uint256).max : 0;
        allowance[holder][spender] = amount;
        emit Approval(holder, spender, amount);
    }

    // Note: Standard EIP-2612 permit is already implemented by Solmate's ERC20
}
