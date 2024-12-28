// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './interfaces/IUniswapV2Router02.sol';
import '@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol';
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidityWrapper is Ownable {
    IUniswapV2Router02 public uniswapRouter;
    AggregatorV3Interface public chainlinkOracle;
    IPyth public pythOracle;

    IERC20 public usdt;
    IERC20 public token;

    address public Token;
    address public usdtToken;

    constructor(
        address _uniswapRouter,
        address _chainlinkOracle,
        address _pythOracle,
        address _tokenAddress,
        address _usdtAddress
    ) Ownable(msg.sender) {
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        chainlinkOracle = AggregatorV3Interface(_chainlinkOracle);
        pythOracle = IPyth(_pythOracle);

        token = IERC20(_tokenAddress);
        usdt = IERC20(_usdtAddress);
    }

    function getChainlinkPrice() public view returns (uint256) {
        (, int256 price,,,) = chainlinkOracle.latestRoundData();
        return uint256(price);
    }

    function getPythPrice() public view returns (uint256) {
        bytes32 priceId = bytes32("BTC/USD"); // This should be the correct Pyth price feed ID
        PythStructs.Price memory pythPrice = pythOracle.getPriceUnsafe(priceId);
        // Convert price to same decimals as Chainlink (8 decimals)
        if (pythPrice.expo < -8) {
            uint256 scale = uint256(uint32(-8 - pythPrice.expo));
            return pythPrice.price >= 0 ? uint256(uint64(pythPrice.price)) * (10**scale) : 0;
        } else if (pythPrice.expo > -8) {
            uint256 scale = uint256(uint32(pythPrice.expo + 8));
            return pythPrice.price >= 0 ? uint256(uint64(pythPrice.price)) / (10**scale) : 0;
        }
        return pythPrice.price >= 0 ? uint256(uint64(pythPrice.price)) : 0;
    }

    function addLiquidityWithUSDT(uint256 usdtAmount) external {
        require(usdt.balanceOf(msg.sender) >= usdtAmount, "Insufficient USDT balance");

        usdt.transferFrom(msg.sender, address(this), usdtAmount);

        uint256 tokenPrice = getChainlinkPrice(); 

        uint256 tokenAmount = (usdtAmount * 1e18) / tokenPrice;

        uint256 halfUSDT = usdtAmount / 2;
        swapUSDTForToken(halfUSDT);

        usdt.approve(address(uniswapRouter), halfUSDT);
        token.approve(address(uniswapRouter), tokenAmount);

        uniswapRouter.addLiquidity(
            address(usdt),
            address(token),
            halfUSDT,
            tokenAmount,
            0,
            0,
            msg.sender,
            block.timestamp
        );
    }

    function swapUSDTForToken(uint256 usdtAmount) internal {
        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(token);

        usdt.approve(address(uniswapRouter), usdtAmount);

        uniswapRouter.swapExactTokensForTokens(
            usdtAmount,
            0, 
            path,
            address(this),
            block.timestamp
        );
    }
}
