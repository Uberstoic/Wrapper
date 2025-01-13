// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.20;

// import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
// import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "../interfaces/IUniswapTWAPOracle.sol";

// contract UniswapTWAPOracle is IUniswapTWAPOracle {
//     address public immutable factory;
//     address public immutable token0;
//     address public immutable token1;
//     IUniswapV2Pair public immutable pair;

//     uint256 public price0CumulativeLast;
//     uint256 public price1CumulativeLast;
//     uint32 public blockTimestampLast;

//     uint256 public constant PERIOD = 1 hours;
//     uint256 private constant Q112 = 2**112;

//     constructor(address _factory, address _token0, address _token1) {
//         require(_factory != address(0), "Invalid factory address");
//         require(_token0 != address(0), "Invalid token0 address");
//         require(_token1 != address(0), "Invalid token1 address");
//         require(_token0 != _token1, "Identical addresses");
        
//         factory = _factory;
//         token0 = _token0;
//         token1 = _token1;

//         // Get the pair from factory
//         IUniswapV2Factory uniswapFactory = IUniswapV2Factory(_factory);
//         address pairAddress = uniswapFactory.getPair(_token0, _token1);
//         require(pairAddress != address(0), "Pair does not exist");
//         pair = IUniswapV2Pair(pairAddress);

//         // Ensure token order matches the pair's order
//         (address pairToken0, address pairToken1) = (_token0, _token1);
//         if (pairToken0 > pairToken1) (pairToken0, pairToken1) = (pairToken1, pairToken0);
//         require(pair.token0() == pairToken0 && pair.token1() == pairToken1, "Token order mismatch");

//         price0CumulativeLast = pair.price0CumulativeLast();
//         price1CumulativeLast = pair.price1CumulativeLast();
//         (, , blockTimestampLast) = pair.getReserves();
//     }

//     function update() external override {
//         (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = 
//             currentCumulativePrices(address(pair));

//         unchecked {
//             uint32 timeElapsed = blockTimestamp - blockTimestampLast;

//             if (timeElapsed >= PERIOD) {
//                 price0CumulativeLast = price0Cumulative;
//                 price1CumulativeLast = price1Cumulative;
//                 blockTimestampLast = blockTimestamp;
//             }
//         }
//     }

//     function currentCumulativePrices(address _pair) 
//         internal 
//         view 
//         returns (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) 
//     {
//         blockTimestamp = uint32(block.timestamp);
//         IUniswapV2Pair uniswapPair = IUniswapV2Pair(_pair);
//         price0Cumulative = uniswapPair.price0CumulativeLast();
//         price1Cumulative = uniswapPair.price1CumulativeLast();

//         (uint112 reserve0, uint112 reserve1, uint32 timestamp) = uniswapPair.getReserves();
        
//         if (timestamp != blockTimestamp && reserve0 != 0 && reserve1 != 0) {
//             unchecked {
//                 uint32 timeElapsed = blockTimestamp - timestamp;
                
//                 // Calculate price0 = reserve1 / reserve0
//                 price0Cumulative += (uint256(reserve1) * Q112 / reserve0) * timeElapsed;
                
//                 // Calculate price1 = reserve0 / reserve1
//                 price1Cumulative += (uint256(reserve0) * Q112 / reserve1) * timeElapsed;
//             }
//         }
//     }

//     function consult(address tokenIn, uint256 amountIn, address tokenOut) 
//         external 
//         view 
//         override 
//         returns (uint256 amountOut) 
//     {
//         require(tokenIn == token0 || tokenIn == token1, "Invalid tokenIn");
//         require(tokenOut == token0 || tokenOut == token1, "Invalid tokenOut");
//         require(tokenIn != tokenOut, "Identical addresses");

//         (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = 
//             currentCumulativePrices(address(pair));

//         unchecked {
//             uint32 timeElapsed = blockTimestamp - blockTimestampLast;
//             require(timeElapsed >= PERIOD, "Time elapsed < min period");

//             if (tokenIn == token0) {
//                 uint256 price = (price0Cumulative - price0CumulativeLast) / timeElapsed;
//                 amountOut = (amountIn * price) / Q112;
//             } else {
//                 uint256 price = (price1Cumulative - price1CumulativeLast) / timeElapsed;
//                 amountOut = (amountIn * price) / Q112;
//             }
//         }
//     }

//     function getPrice() external view override returns (uint256) {
//         (uint256 price0Cumulative, , uint32 blockTimestamp) = currentCumulativePrices(address(pair));
        
//         unchecked {
//             uint32 timeElapsed = blockTimestamp - blockTimestampLast;
//             require(timeElapsed >= PERIOD, "Time elapsed < min period");
            
//             return (price0Cumulative - price0CumulativeLast) / timeElapsed;
//         }
//     }
// }