import { task } from "hardhat/config";
import { LiquidityWrapper, MockERC20, IPyth } from "../typechain-types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractConfig } from "../hardhat.config";
import axios from "axios";

// Helper function to get deployed contracts
async function getContracts(hre: HardhatRuntimeEnvironment) {
    try {
        const deployments = require('../deployments/localhost_2025-01-14.json');
        const wrapper = await hre.ethers.getContractAt("LiquidityWrapper", deployments.wrapper) as LiquidityWrapper;
        const token = await hre.ethers.getContractAt("MockERC20", deployments.token) as MockERC20;
        const usdt = await hre.ethers.getContractAt("MockERC20", deployments.usdt) as MockERC20;
        const pythOracle = await hre.ethers.getContractAt("IPyth", contractConfig.mainnet.pythMainnet) as IPyth;
        // const twapOracle = await hre.ethers.getContractAt("UniswapTWAPOracle", deployments.twapOracle);
        return { wrapper, token, usdt, pythOracle};
    } catch (error) {
        console.error("Error: Deployments file not found or contracts not deployed. Please run 'npx hardhat run scripts/deploy.ts --network localhost' first");
        throw error;
    }
}

// Helper function to get Pyth price update data
async function getPythPriceUpdateData() {
    // Use the endpoint for mainnet
    const pythUrl = "https://hermes.pyth.network/api/latest_vaas?ids[]=e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
    try {
        const response = await axios.get(pythUrl);
        console.log("Got Pyth VAA data");
        return response.data.map((vaa: string) => Buffer.from(vaa, 'base64'));
    } catch (error) {
        console.error("Error fetching Pyth VAA data:", error);
        throw error;
    }
}

// Get price from oracles
task("get-price", "Get the current price of BTC from oracles")
    .setAction(async (taskArgs, hre) => {
        try {
            // Get deployment info
            const deployments = require('../deployments/localhost_2025-01-14.json');
            
            // Get Chainlink price
            const chainlinkFeed = await hre.ethers.getContractAt(
                "AggregatorV3Interface",
                contractConfig.mainnet.chainlinkBtcUsd
            );
            const [, answer] = await chainlinkFeed.latestRoundData();
            const chainlinkPrice = Number(answer) / 10**8;
            console.log("Chainlink BTC Price:", `$${chainlinkPrice.toFixed(2)}`);

            // Get Pyth price
            const { wrapper } = await getContracts(hre);
            const pythPrice = await wrapper.getPythPrice();
            console.log("Pyth BTC Price:", `$${Number(pythPrice) / 10**8}`);

            // // Get TWAP price
            // const { twapOracle } = await getContracts(hre);
            // const twapPrice = await twapOracle.getPrice();
            // console.log("TWAP Price:", `$${Number(twapPrice) / 10**8}`);
        } catch (error) {
            console.error("Error getting prices:", error);
        }
    });

// Add liquidity with USDT only
task("add-liquidity-usdt", "Add liquidity using only USDT")
    .addParam("amount", "Amount of USDT to add")
    .setAction(async (taskArgs, hre) => {
        const { wrapper, usdt } = await getContracts(hre);
        const [signer] = await hre.ethers.getSigners();

        const amount = hre.ethers.utils.parseUnits(taskArgs.amount, 6); // USDT has 6 decimals
        
        // Approve USDT spending
        console.log("Approving USDT...");
        await usdt.connect(signer).approve(wrapper.address, amount);
        
        // Add liquidity
        console.log(`Adding liquidity with ${taskArgs.amount} USDT...`);
        const tx = await wrapper.connect(signer).addLiquidityWithUSDT(amount);
        await tx.wait();
        
        console.log("Liquidity added successfully!");
    });

// Add liquidity with both tokens
task("add-liquidity-both", "Add liquidity using both USDT and token")
    .addParam("usdtAmount", "Amount of USDT to add")
    .addParam("tokenAmount", "Amount of tokens to add")
    .setAction(async (taskArgs, hre) => {
        const { wrapper, token, usdt } = await getContracts(hre);
        const [signer] = await hre.ethers.getSigners();

        const usdtAmount = hre.ethers.utils.parseUnits(taskArgs.usdtAmount, 6);
        const tokenAmount = hre.ethers.utils.parseEther(taskArgs.tokenAmount);
        
        // Approve both tokens
        console.log("Approving tokens...");
        await usdt.connect(signer).approve(wrapper.address, usdtAmount);
        await token.connect(signer).approve(wrapper.address, tokenAmount);
        
        // Add liquidity
        console.log(`Adding liquidity with ${taskArgs.usdtAmount} USDT and ${taskArgs.tokenAmount} tokens...`);
        const tx = await wrapper.connect(signer).addLiquidityWithBothTokens(usdtAmount, tokenAmount);
        await tx.wait();
        
        console.log("Liquidity added successfully!");
    });

// Check balances
task("check-balances", "Check token balances")
    .setAction(async (_, hre) => {
        const { token, usdt } = await getContracts(hre);
        const [signer] = await hre.ethers.getSigners();

        const usdtBalance = await usdt.balanceOf(signer.address);
        const tokenBalance = await token.balanceOf(signer.address);
        
        console.log(`USDT Balance: ${hre.ethers.utils.formatUnits(usdtBalance, 6)}`);
        console.log(`Token Balance: ${hre.ethers.utils.formatEther(tokenBalance)}`);
    });

/*
task("update-chainlink-price", "Update mock Chainlink oracle price to match Pyth")
    .setAction(async (_, hre) => {
        try {
            // Get Pyth price first
            const pythData = await getPythPriceUpdateData();
            const pythPrice = Number(pythData.price) * Math.pow(10, Number(pythData.expo));
            
            // Get deployment info
            const deployments = require('../deployments/localhost_2025-01-13.json');
            
            // Get mock Chainlink oracle
            const mockChainlinkOracle = await hre.ethers.getContractAt(
                "MockChainlinkOracle",
                deployments.chainlinkOracle
            );
            
            // Convert price to Chainlink format (8 decimals)
            const chainlinkPrice = Math.round(pythPrice * 1e8);
            
            // Update price
            await mockChainlinkOracle.setPrice(chainlinkPrice);
            console.log("Updated mock Chainlink oracle price to match Pyth price");
            
            // Verify prices
            const [, newPrice] = await mockChainlinkOracle.latestRoundData();
            console.log("New Chainlink BTC Price:", `$${(Number(newPrice) / 1e8).toFixed(2)}`);
        } catch (error) {
            console.error("Error updating mock Chainlink oracle price:", error);
        }
    });
*/

// Update Chainlink price 
task("update-chainlink", "Update Chainlink price feed")
    .setAction(async (taskArgs, hre) => {
        try {
            // Get real Chainlink oracle for BTC/USD
            const realChainlinkOracle = await hre.ethers.getContractAt(
                "AggregatorV3Interface",
                contractConfig.mainnet.chainlinkBtcUsd
            );
            
            // Get mock Chainlink oracle
            const mockChainlinkOracle = await hre.ethers.getContractAt(
                "MockChainlinkOracle",
                contractConfig.mainnet.chainlinkBtcUsd
            );

            // Get current price from real Chainlink oracle
            const [, realPrice, , updatedAt] = await realChainlinkOracle.latestRoundData();
            console.log("\nReal Chainlink BTC/USD price:", `$${Number(realPrice) / 1e8}`);
            console.log("Last updated:", new Date(updatedAt.toNumber() * 1000).toISOString());
            
            // Update mock oracle with real Chainlink price
            console.log("\nUpdating mock Chainlink oracle...");
            const tx = await mockChainlinkOracle.setPrice(realPrice);
            await tx.wait();
            
            // Verify the update
            const [, newPrice] = await mockChainlinkOracle.latestRoundData();
            console.log("\nUpdated mock Chainlink price:", `$${Number(newPrice) / 1e8}`);
            
            console.log("Chainlink price feed updated successfully!");
        } catch (error) {
            console.error("Error updating Chainlink price:", error);
        }
    });

// // Update TWAP oracle
// task("update-twap", "Update the TWAP oracle price")
//     .setAction(async (taskArgs, hre) => {
//         const { twapOracle } = await getContracts(hre);
//         console.log("\nUpdating TWAP oracle...");
//         const tx = await twapOracle.update();
//         await tx.wait();
//         console.log("TWAP oracle updated successfully!");
//     });

// // Get TWAP price
// task("get-twap-price", "Get the current TWAP price")
//     .setAction(async (taskArgs, hre) => {
//         const { twapOracle } = await getContracts(hre);
//         const price = await twapOracle.getPrice();
//         console.log("\nTWAP Price:", hre.ethers.utils.formatUnits(price, 8));
//     });

// Update Pyth price
task("update-pyth", "Update Pyth price feed")
    .setAction(async (taskArgs, hre) => {
        try {
            const { pythOracle } = await getContracts(hre);
            
            // Get Pyth VAA data
            const updateData = await getPythPriceUpdateData();
            
            // Calculate update fee
            const updateFee = await pythOracle.getUpdateFee(updateData);
            
            // Update price feeds
            console.log("\nUpdating Pyth price feed...");
            const tx = await pythOracle.updatePriceFeeds(updateData, { value: updateFee });
            await tx.wait();
            
            console.log("Pyth price feed updated successfully!");
        } catch (error) {
            console.error("Error updating Pyth price:", error);
        }
    });

// Increase time
// task("increase-time", "Increase blockchain time")
//     .addParam("seconds", "Number of seconds to increase")
//     .setAction(async (taskArgs, hre) => {
//         try {
//             await hre.network.provider.send("evm_increaseTime", [parseInt(taskArgs.seconds)]);
//             await hre.network.provider.send("evm_mine");
//             console.log(`Increased time by ${taskArgs.seconds} seconds`);
//         } catch (error) {
//             console.error("Error increasing time:", error);
//         }
//     });

// // Check pool liquidity
// task("check-pool", "Check Uniswap pool liquidity")
//     .setAction(async (taskArgs, hre) => {
//         try {
//             // Get deployment info
//             const deployments = require('../deployments/localhost_2025-01-13.json');
            
//             // Get pair contract
//             const pair = await hre.ethers.getContractAt("IUniswapV2Pair", deployments.uniswapPair);
            
//             // Get reserves
//             const [reserve0, reserve1, timestamp] = await pair.getReserves();
//             console.log("\nPool reserves:");
//             console.log("Reserve0:", hre.ethers.utils.formatUnits(reserve0, 6));  // USDT has 6 decimals
//             console.log("Reserve1:", hre.ethers.utils.formatUnits(reserve1, 18)); // Token has 18 decimals
//             console.log("Last update timestamp:", timestamp);
            
//             // Get tokens
//             const token0 = await pair.token0();
//             const token1 = await pair.token1();
//             console.log("\nPool tokens:");
//             console.log("Token0:", token0);
//             console.log("Token1:", token1);
            
//         } catch (error) {
//             console.error("Error checking pool:", error);
//         }
//     });

// // Check Chainlink state
// task("check-chainlink", "Check Chainlink oracle state")
//     .setAction(async (taskArgs, hre) => {
//         try {
//             // Get Chainlink oracle
//             const chainlinkOracle = await hre.ethers.getContractAt(
//                 "AggregatorV3Interface",
//                 contractConfig.mainnet.chainlinkBtcUsd
//             );
            
//             // Get current round data
//             const [roundId, price, startedAt, updatedAt, answeredInRound] = await chainlinkOracle.latestRoundData();
            
//             console.log("\nChainlink Oracle State:");
//             console.log("Price:", hre.ethers.utils.formatUnits(price, 8));
//             console.log("Last Updated:", new Date(updatedAt.toNumber() * 1000).toISOString());
//             console.log("Round ID:", roundId.toString());
//             console.log("Started At:", new Date(startedAt.toNumber() * 1000).toISOString());
//             console.log("Answered In Round:", answeredInRound.toString());
            
//             // Get current block timestamp
//             const currentBlock = await hre.ethers.provider.getBlock("latest");
//             console.log("\nCurrent Block:");
//             console.log("Timestamp:", new Date(currentBlock.timestamp * 1000).toISOString());
//             console.log("Number:", currentBlock.number);
            
//         } catch (error) {
//             console.error("Error checking Chainlink state:", error);
//         }
//     });
