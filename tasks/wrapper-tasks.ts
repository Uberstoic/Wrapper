import { task } from "hardhat/config";
import { LiquidityWrapper, MockERC20 } from "../typechain-types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractConfig } from "../hardhat.config";
import axios from "axios";

// Helper function to get deployed contracts
async function getContracts(hre: HardhatRuntimeEnvironment) {
    const deployments = require('../deployments/localhost_2025-01-10.json');
    const wrapper = await hre.ethers.getContractAt("LiquidityWrapper", deployments.wrapper) as LiquidityWrapper;
    const token = await hre.ethers.getContractAt("MockERC20", deployments.token) as MockERC20;
    const usdt = await hre.ethers.getContractAt("MockERC20", deployments.usdt) as MockERC20;
    const pythOracle = await hre.ethers.getContractAt("IPyth", contractConfig.mainnet.pythMainnet);
    return { wrapper, token, usdt, pythOracle };
}

// Helper function to get Pyth price update data
async function getPythPriceUpdateData() {
    // Use the endpoint for mainnet
    const pythUrl = "https://hermes.pyth.network/api/latest_price_feeds?ids[]=e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
    try {
        const response = await axios.get(pythUrl);
        console.log("Pyth API response:", JSON.stringify(response.data, null, 2));
        
        // Extract price information
        const priceData = response.data[0].price;
        const price = BigInt(priceData.price);
        const conf = BigInt(priceData.conf);
        const expo = BigInt(priceData.expo);
        const publishTime = BigInt(priceData.publish_time);
        
        // Convert price to human readable format for logging
        const humanReadablePrice = Number(price) * Math.pow(10, Number(expo));
        console.log("Pyth BTC Price:", `$${humanReadablePrice.toFixed(2)}`);
        
        // Return the price data
        return {
            price,
            conf,
            expo,
            publishTime
        };
    } catch (error) {
        console.error("Error fetching Pyth price update data:", error);
        throw error;
    }
}

// Get price from oracles
task("get-price", "Get the current price of BTC from oracles")
    .setAction(async (taskArgs, hre) => {
        try {
            // Get deployment info
            const deployments = require('../deployments/localhost_2025-01-10.json');
            
            // Get Chainlink price
            const chainlinkFeed = await hre.ethers.getContractAt(
                "AggregatorV3Interface",
                deployments.chainlinkOracle
            );
            const [, answer] = await chainlinkFeed.latestRoundData();
            const chainlinkPrice = Number(answer) / 10**8;
            console.log("Chainlink BTC Price:", `$${chainlinkPrice.toFixed(2)}`);

            // Get Pyth price
            await getPythPriceUpdateData();
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

// Update mock Chainlink oracle price
task("update-chainlink-price", "Update mock Chainlink oracle price to match Pyth")
    .setAction(async (_, hre) => {
        try {
            // Get Pyth price first
            const pythData = await getPythPriceUpdateData();
            const pythPrice = Number(pythData.price) * Math.pow(10, Number(pythData.expo));
            
            // Get deployment info
            const deployments = require('../deployments/localhost_2025-01-10.json');
            
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
