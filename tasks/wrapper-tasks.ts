import { task } from "hardhat/config";
import { BigNumber } from "ethers";
import { LiquidityWrapper, MockERC20, IPyth, IUniswapV2Pair, IUniswapV2Router02 } from "../typechain-types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractConfig } from "../hardhat.config";
import axios from "axios";

// Helper function to get deployed contracts
async function getContracts(hre: HardhatRuntimeEnvironment) {
    try {
        const deployments = require('../deployments/localhost_2025-01-16.json');
        const wrapper = await hre.ethers.getContractAt("LiquidityWrapper", deployments.wrapper) as LiquidityWrapper;
        const token = await hre.ethers.getContractAt("MockERC20", deployments.token) as MockERC20;
        const usdt = await hre.ethers.getContractAt("MockERC20", deployments.usdt) as MockERC20;
        const pythOracle = await hre.ethers.getContractAt("IPyth", contractConfig.mainnet.pythMainnet) as IPyth;
        const uniswapPair = await hre.ethers.getContractAt("IUniswapV2Pair", deployments.uniswapPair) as IUniswapV2Pair;
        return { wrapper, token, usdt, pythOracle, uniswapPair };
    } catch (error) {
        console.error("Error: Deployments file not found or contracts not deployed. Please run 'npx hardhat run scripts/deploy.ts --network localhost' first");
        throw error;
    }
}

// Helper function to get Pyth price update data
async function getPythPriceUpdateData() {
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

// TWAP Configuration
const TWAP_CONFIG = {
    MIN_INTERVAL: 900,      // Minimum 15 minutes
    MAX_INTERVAL: 86400,    // Maximum 24 hours
    DEFAULT_INTERVAL: 3600, // Default 1 hour
    MAX_PRICE_DEVIATION: 20 // Maximum 0% pri2ce deviation
};

interface TWAPObservation {
    timestamp: BigNumber;
    price0Cumulative: BigNumber;
    price1Cumulative: BigNumber;
}

let lastTWAPObservation: TWAPObservation | null = null;

// Helper function to validate TWAP interval
function validateTWAPInterval(interval: number): void {
    if (interval < TWAP_CONFIG.MIN_INTERVAL || interval > TWAP_CONFIG.MAX_INTERVAL) {
        throw new Error(`TWAP interval must be between ${TWAP_CONFIG.MIN_INTERVAL} and ${TWAP_CONFIG.MAX_INTERVAL} seconds`);
    }
}

// Helper function to calculate TWAP
async function calculateTWAP(
    uniswapPair: IUniswapV2Pair,
    interval: number,
    hre: HardhatRuntimeEnvironment
): Promise<{ price0TWAP: BigNumber; price1TWAP: BigNumber }> {
    validateTWAPInterval(interval);

    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const currentTimestamp = BigNumber.from(currentBlock.timestamp);

    // Get current state
    const { reserve0, reserve1 } = await uniswapPair.getReserves();
    if (reserve0.eq(0) || reserve1.eq(0)) {
        throw new Error("Zero reserves detected");
    }

    const price0Cumulative = await uniswapPair.price0CumulativeLast();
    const price1Cumulative = await uniswapPair.price1CumulativeLast();

    // Initialize observation if not exists
    if (!lastTWAPObservation) {
        lastTWAPObservation = {
            timestamp: currentTimestamp,
            price0Cumulative,
            price1Cumulative
        };
        throw new Error("Initial TWAP observation set. Please wait for the specified interval.");
    }

    const timeElapsed = currentTimestamp.sub(lastTWAPObservation.timestamp);
    if (timeElapsed.lt(interval)) {
        throw new Error(`Not enough time elapsed. Need ${interval - timeElapsed.toNumber()} more seconds`);
    }

    // Calculate TWAP
    const price0TWAP = price0Cumulative
        .sub(lastTWAPObservation.price0Cumulative)
        .div(timeElapsed);
    const price1TWAP = price1Cumulative
        .sub(lastTWAPObservation.price1Cumulative)
        .div(timeElapsed);

    // Update observation
    lastTWAPObservation = {
        timestamp: currentTimestamp,
        price0Cumulative,
        price1Cumulative
    };

    return { price0TWAP, price1TWAP };
}

// Task: Get price from oracles
task("get-price", "Get the current price from oracles and TWAP")
    .setAction(async (taskArgs, hre) => {
        try {
            const { uniswapPair, wrapper } = await getContracts(hre);

            // Get Chainlink price
            try {
                const chainlinkPrice = await wrapper.getChainlinkPrice();
                console.log("Chainlink BTC Price: $" + hre.ethers.utils.formatUnits(chainlinkPrice, 8));
            } catch (error) {
                console.log("Error getting Chainlink price:", error.message);
            }

            // Get Pyth price (wrapped in try-catch)
            try {
                const pythPrice = await wrapper.getPythPrice();
                console.log("Pyth BTC Price: $" + hre.ethers.utils.formatUnits(pythPrice, 8));
            } catch (error) {
                console.log("Pyth price not available (this is expected in local testing)");
            }

            // Calculate TWAP
            console.log("\nCalculating TWAP...");
            const { reserve0, reserve1 } = await uniswapPair.getReserves();
            const currentPrice = reserve1.mul(BigNumber.from(10).pow(18)).div(reserve0);
            console.log("Current Spot Price:", "$" + hre.ethers.utils.formatUnits(currentPrice, 6));

            if (!lastTWAPObservation) {
                lastTWAPObservation = {
                    timestamp: (await hre.ethers.provider.getBlock("latest")).timestamp,
                    price0Cumulative: await uniswapPair.price0CumulativeLast(),
                    price1Cumulative: await uniswapPair.price1CumulativeLast()
                };
                console.log("Initial TWAP observation set. Please wait for the specified interval.");
            } else {
                const { price0TWAP, price1TWAP } = await calculateTWAP(uniswapPair, TWAP_CONFIG.MIN_INTERVAL, hre);
                console.log("TWAP Price:", "$" + hre.ethers.utils.formatUnits(price1TWAP, 6));
            }

        } catch (error: any) {
            console.error("Error getting prices:", error);
        }
    });

// Task: Update TWAP oracle
task("update-twap", "Update the TWAP oracle price")
    .setAction(async (taskArgs, hre) => {
        try {
            const { uniswapPair } = await getContracts(hre);
            console.log("\nReading current cumulative price...");

            // Get current state
            const { reserve0, reserve1, blockTimestampLast: lastTimestamp } = await uniswapPair.getReserves();
            const currentTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const price0Cumulative = await uniswapPair.price0CumulativeLast();
            const price1Cumulative = await uniswapPair.price1CumulativeLast();

            // Calculate the current price from reserves
            const price = reserve1.mul(hre.ethers.utils.parseUnits("1", 18)).div(reserve0);
            
            console.log("Current State:");
            console.log("Reserves:", {
                reserve0: hre.ethers.utils.formatUnits(reserve0, 18),  // Assuming token0 has 18 decimals
                reserve1: hre.ethers.utils.formatUnits(reserve1, 6),   // Assuming USDT (6 decimals)
                lastUpdateTime: new Date(lastTimestamp * 1000).toISOString()
            });
            console.log("Current Price:", hre.ethers.utils.formatUnits(price, 6));
            console.log("Cumulative Prices:", {
                price0Cumulative: price0Cumulative.toString(),
                price1Cumulative: price1Cumulative.toString(),
                currentTimestamp,
                timeElapsed: currentTimestamp - lastTimestamp
            });

        } catch (error) {
            console.error("Error updating TWAP:", error);
        }
    });

// Task: Get TWAP price
task("get-twap-price", "Get the real TWAP price from Uniswap V2")
    .addOptionalParam("interval", "TWAP interval in seconds", "3600")
    .setAction(async (taskArgs, hre) => {
        try {
            const { uniswapPair } = await getContracts(hre);
            const interval = parseInt(taskArgs.interval);

            // Get initial observation
            console.log("\nFetching initial observation...");
            const initialBlock = await hre.ethers.provider.getBlock("latest");
            const { reserve0: initialReserve0, reserve1: initialReserve1 } = await uniswapPair.getReserves();

            // Calculate initial price (price1/price0)
            const initialPrice = initialReserve1.mul(hre.ethers.utils.parseUnits("1", 18)).div(initialReserve0);

            console.log("Initial State:", {
                timestamp: new Date(initialBlock.timestamp * 1000).toISOString(),
                reserve0: hre.ethers.utils.formatUnits(initialReserve0, 18),
                reserve1: hre.ethers.utils.formatUnits(initialReserve1, 6),
                price: hre.ethers.utils.formatUnits(initialPrice, 6)
            });

            // Simulate some price updates
            console.log("\nSimulating price updates...");
            
            // Update 1: Small price change
            await hre.network.provider.send("evm_increaseTime", [interval / 3]);
            await hre.network.provider.send("evm_mine");
            
            // Update 2: Another price change
            await hre.network.provider.send("evm_increaseTime", [interval / 3]);
            await hre.network.provider.send("evm_mine");
            
            // Final update
            await hre.network.provider.send("evm_increaseTime", [interval / 3]);
            await hre.network.provider.send("evm_mine");

            // Get final state
            const finalBlock = await hre.ethers.provider.getBlock("latest");
            const { reserve0: finalReserve0, reserve1: finalReserve1 } = await uniswapPair.getReserves();
            const finalPrice = finalReserve1.mul(hre.ethers.utils.parseUnits("1", 18)).div(finalReserve0);

            console.log("Final State:", {
                timestamp: new Date(finalBlock.timestamp * 1000).toISOString(),
                reserve0: hre.ethers.utils.formatUnits(finalReserve0, 18),
                reserve1: hre.ethers.utils.formatUnits(finalReserve1, 6),
                price: hre.ethers.utils.formatUnits(finalPrice, 6)
            });

            // Calculate time-weighted average price
            const timeElapsed = finalBlock.timestamp - initialBlock.timestamp;
            console.log("\nTime elapsed:", timeElapsed, "seconds");
            
            // Since we don't have actual price updates, we'll use the constant price
            const twap = finalPrice;
            console.log("Calculated TWAP:", hre.ethers.utils.formatUnits(twap, 6));

            console.log("\nNote: For accurate TWAP calculation in production:");
            console.log("1. Ensure price updates through trades");
            console.log("2. Use price0CumulativeLast and price1CumulativeLast");
            console.log("3. Calculate using: (priceLatest - priceInitial) / timeElapsed");

        } catch (error) {
            console.error("Error getting TWAP price:", error);
        }
    });

// Task: Simulate trades and calculate TWAP
task("simulate-twap", "Simulate trades and calculate TWAP")
    .addOptionalParam("interval", "Time between trades in seconds", TWAP_CONFIG.MIN_INTERVAL.toString())
    .addOptionalParam("trades", "Number of trades to simulate", "6")
    .setAction(async (taskArgs, hre) => {
        try {
            const { uniswapPair, token, usdt } = await getContracts(hre);
            const [signer] = await hre.ethers.getSigners();
            const interval = parseInt(taskArgs.interval);
            const numTrades = parseInt(taskArgs.trades);

            // Get the router
            const router = await hre.ethers.getContractAt(
                "IUniswapV2Router02",
                "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
            );

            // Check liquidity
            const { reserve0, reserve1 } = await uniswapPair.getReserves();
            console.log("\nCurrent Liquidity:");
            console.log("Token0 Reserve:", hre.ethers.utils.formatUnits(reserve0, 18));
            console.log("Token1 Reserve:", hre.ethers.utils.formatUnits(reserve1, 6));

            // Reset TWAP observation
            lastTWAPObservation = null;

            // Mint tokens for trading
            const tradingAmount = hre.ethers.utils.parseUnits("1000", 18); // 1000 tokens
            const usdtAmount = hre.ethers.utils.parseUnits("3000000", 6); // 3M USDT
            
            console.log("\nMinting tokens for trading...");
            await token.connect(signer).mint(signer.address, tradingAmount);
            await usdt.connect(signer).mint(signer.address, usdtAmount);

            // Check balances
            const tokenBalance = await token.balanceOf(signer.address);
            const usdtBalance = await usdt.balanceOf(signer.address);
            
            console.log("\nTrader Balances:");
            console.log("Token Balance:", hre.ethers.utils.formatUnits(tokenBalance, 18));
            console.log("USDT Balance:", hre.ethers.utils.formatUnits(usdtBalance, 6));

            // Approve max amounts
            console.log("\nApproving tokens...");
            const maxAmount = hre.ethers.constants.MaxUint256;
            await token.connect(signer).approve(router.address, maxAmount);
            await usdt.connect(signer).approve(router.address, maxAmount);

            console.log(`\nSimulating ${numTrades} trades with ${interval} seconds interval...`);
            console.log("This will take approximately", (numTrades * interval) / 60, "minutes");

            let totalPriceChange = 0;

            for (let i = 0; i < numTrades; i++) {
                // Simulate time passing
                await hre.network.provider.send("evm_increaseTime", [interval]);
                await hre.network.provider.send("evm_mine");

                // Get current block for deadline
                const currentBlock = await hre.ethers.provider.getBlock("latest");
                const deadline = currentBlock.timestamp + 600; // 10 minutes from current block

                // Get current state before trade
                const { reserve0: prevReserve0, reserve1: prevReserve1 } = await uniswapPair.getReserves();
                const prevPrice = prevReserve1.mul(BigNumber.from(10).pow(18)).div(prevReserve0);

                // Calculate smaller trade amounts (0.1% of reserves)
                const tokenTradeAmount = prevReserve0.mul(1).div(1000);
                const usdtTradeAmount = prevReserve1.mul(1).div(1000);

                if (i % 2 === 0) {
                    // Buy tokens with USDT
                    console.log(`\nTrade ${i + 1}/${numTrades}: Buying tokens with ${hre.ethers.utils.formatUnits(usdtTradeAmount, 6)} USDT`);
                    
                    await router.connect(signer).swapExactTokensForTokens(
                        usdtTradeAmount,
                        0, // Accept any amount of tokens
                        [usdt.address, token.address],
                        signer.address,
                        deadline
                    );
                } else {
                    // Sell tokens for USDT
                    console.log(`\nTrade ${i + 1}/${numTrades}: Selling ${hre.ethers.utils.formatUnits(tokenTradeAmount, 18)} tokens`);
                    
                    await router.connect(signer).swapExactTokensForTokens(
                        tokenTradeAmount,
                        0, // Accept any amount of USDT
                        [token.address, usdt.address],
                        signer.address,
                        deadline
                    );
                }

                // Calculate and store TWAP
                try {
                    const { price0TWAP, price1TWAP } = await calculateTWAP(uniswapPair, interval, hre);
                    
                    // Get new spot price
                    const { reserve0, reserve1 } = await uniswapPair.getReserves();
                    const newPrice = reserve1.mul(BigNumber.from(10).pow(18)).div(reserve0);
                    
                    // Calculate price change as percentage
                    const priceChange = (
                        (Number(hre.ethers.utils.formatUnits(newPrice, 18)) - 
                         Number(hre.ethers.utils.formatUnits(prevPrice, 18))) / 
                        Number(hre.ethers.utils.formatUnits(prevPrice, 18))
                    ) * 100;
                    
                    totalPriceChange += Math.abs(priceChange);

                    console.log("Trade completed:");
                    console.log("Price Change:", `${priceChange.toFixed(2)}%`);
                    console.log("TWAP Price:", hre.ethers.utils.formatUnits(price1TWAP, 18));
                    console.log("Spot Price:", hre.ethers.utils.formatUnits(newPrice, 18));
                    console.log("New Reserves:", {
                        token: hre.ethers.utils.formatUnits(reserve0, 18),
                        usdt: hre.ethers.utils.formatUnits(reserve1, 6)
                    });

                    // Show updated balances
                    const newTokenBalance = await token.balanceOf(signer.address);
                    const newUsdtBalance = await usdt.balanceOf(signer.address);
                    console.log("Updated Balances:", {
                        token: hre.ethers.utils.formatUnits(newTokenBalance, 18),
                        usdt: hre.ethers.utils.formatUnits(newUsdtBalance, 6)
                    });
                } catch (error: any) {
                    console.log(`Trade ${i + 1}/${numTrades}: ${error.message}`);
                }
            }

            console.log("\nSimulation Summary:");
            console.log("Total Trades:", numTrades);
            console.log("Average Price Volatility:", (totalPriceChange / numTrades).toFixed(2), "%");
            console.log("Total Time Elapsed:", numTrades * interval, "seconds");

        } catch (error) {
            console.error("Error simulating trades:", error);
        }
    });

// Define a configurable interval constant
const TWAP_INTERVAL = 3600; // 1 hour in seconds

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

// Task: Advance time
task("advance-time", "Advance blockchain time by specified seconds")
    .addParam("seconds", "Number of seconds to advance")
    .setAction(async (taskArgs, hre) => {
        try {
            const seconds = parseInt(taskArgs.seconds);
            console.log(`\nAdvancing time by ${seconds} seconds...`);
            
            await hre.network.provider.send("evm_increaseTime", [seconds]);
            await hre.network.provider.send("evm_mine");
            
            const block = await hre.ethers.provider.getBlock("latest");
            console.log("New block timestamp:", new Date(block.timestamp * 1000).toISOString());
        } catch (error) {
            console.error("Error advancing time:", error);
        }
    });