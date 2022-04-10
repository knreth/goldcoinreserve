// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * Gold Coin Reserve Token, with transfer limit
 */
contract GoldCoinReserve is ERC20, Ownable {
    // Initial supply, 3M tokens
    uint256 public constant INITIAL_SUPPLY = 3_000_000 ether;

    // Per day transfer limit, per wallet
    uint256 public transferLimit;

    // Old GCR contract address, for migratiing from old to this new contract
    address public oldGCR;

    // List of addresses to skip transfer limits checks
    mapping(address => bool) private _whitelisted;

    struct UserTransfer {
        uint256 lastTime;
        uint256 perDayTransfer;
    }

    // user per day transfers
    mapping(address => UserTransfer) private userTransfers;

    /**
     * @notice emitted when transfer limit is set
     * @param limit per day limit
     */
    event TransferLimitSet(uint256 indexed limit);

    /**
     * @notice emitted when a user swapped their old GCR tokens with new
     * tokens.
     */
    event SwappedOldGCR(address indexed user, uint256 amount);

    constructor(address _oldGCR) ERC20("Gold Coin Reserve", "GCR") {
        // Mint initial fixed supply
        _mint(msg.sender, INITIAL_SUPPLY);
        oldGCR = _oldGCR;
    }

    /**
     * @notice mints new tokens, only owner can mint. No per day limit on mints
     * @param to address to whom the tokens will be minted
     * @param amount number of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice burns tokens of the caller. No per day limit on burn
     * @param amount number of tokens to mint
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @notice sets transfer limit per day per wallet. Only by owner can set
     * @notice can be set to 0 to disable transfer limits
     * @param _limit Number of tokens per day
     */
    function setTransferLimit(uint256 _limit) external onlyOwner {
        transferLimit = _limit;
        emit TransferLimitSet(_limit);
    }

    /**
     * @notice sets address of the old GCR token contract, only owner can set
     * @param _oldGCR old GCR contract address
     */
    function setOldGCRContract(address _oldGCR) external onlyOwner {
        oldGCR = _oldGCR;
    }

    /**
     * @notice Swap old GCR tokens with new tokens, caller must approve
     * @notice tokens to this contract address
     * @param amount number of tokens to swap
     */
    function swapOldGCR(uint256 amount) external {
        require(oldGCR != address(0), "GCR: old GCR address not set");

        uint256 balance = IERC20(oldGCR).balanceOf(msg.sender);
        require(balance >= amount, "GCR: not enough old GCR tokens");

        // Transfer old GCR to this contract
        bool status = IERC20(oldGCR).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        require(status, "GCR: transfer from old GCR failed");

        // Transfer new tokens equivalent of old ones
        status = this.transfer(msg.sender, amount);
        require(status, "GCR: new token transfer failed");
        emit SwappedOldGCR(msg.sender, amount);
    }

    /**
     * @notice withdraw old GCR tokens swapped by users
     * @param to address
     * @param amount number of tokens to withdraw
     */
    function withdrawSwappedOldGCR(address to, uint256 amount)
        external
        onlyOwner
    {
        require(oldGCR != address(0), "GCR: old GCR address not set");
        IERC20(oldGCR).transfer(to, amount);
    }

    function whitelistAccount(address account) external onlyOwner {
        _whitelisted[account] = true;
    }

    function unWhitelistAccount(address account) external onlyOwner {
        delete _whitelisted[account];
    }

    function isWhitelisted(address account) public view returns (bool) {
        return _whitelisted[account];
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        // Check for transfer limits, skip for mints and burns
        if ((transferLimit > 0) && (from != address(0)) && (to != address(0))) {
            // Both 'from' and 'to' addresses should not be in the whiltlist
            // to enforce the limit
            if (!isWhitelisted(from) && !isWhitelisted(to))
                _enforceTransferLimit(from, amount);
        }
    }

    function _enforceTransferLimit(address from, uint256 amount) internal {
        UserTransfer storage uTransfer = userTransfers[from];

        require(amount <= transferLimit, "GCR: daily limit exceeds");

        if ((block.timestamp - uTransfer.lastTime) >= 1 days) {
            uTransfer.lastTime = block.timestamp;
            uTransfer.perDayTransfer = amount;
        } else {
            require(
                (amount + uTransfer.perDayTransfer) <= transferLimit,
                "GCR: daily limit exceeds"
            );
            uTransfer.perDayTransfer += amount;
        }
    }
}
