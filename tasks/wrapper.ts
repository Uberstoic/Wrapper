import { task } from "hardhat/config";
import { BigNumber } from "ethers";
import "@nomiclabs/hardhat-waffle";

task("add-liquidity-usdt", "Add liquidity with USDT only")
  .addParam("wrapper", "The wrapper contract address")
  .addParam("amount", "Amount of USDT to add")
  .setAction(async (taskArgs, hre) => {
    const wrapper = await hre.ethers.getContractAt("LiquidityWrapper", taskArgs.wrapper);
    const usdt = await hre.ethers.getContractAt("IERC20", await wrapper.usdt());

    const amount = hre.ethers.utils.parseUnits(taskArgs.amount, 6); // USDT has 6 decimals
    
    // Approve USDT
    console.log("Approving USDT...");
    await usdt.approve(wrapper.address, amount);
    
    // Add liquidity
    console.log("Adding liquidity...");
    const tx = await wrapper.addLiquidityWithUSDT(amount);
    await tx.wait();
    
    console.log("Liquidity added successfully!");
  });

task("get-price", "Get BTC price from different oracles")
  .addParam("wrapper", "The wrapper contract address")
  .setAction(async (taskArgs, hre) => {
    const wrapper = await hre.ethers.getContractAt("LiquidityWrapper", taskArgs.wrapper);
    
    // Get prices from different oracles
    const chainlinkPrice = await wrapper.getChainlinkPrice();
    const pythPrice = await wrapper.getPythPrice();
    
    console.log("Chainlink BTC/USD Price:", hre.ethers.utils.formatUnits(chainlinkPrice, 8));
    console.log("Pyth BTC/USD Price:", hre.ethers.utils.formatUnits(pythPrice, 8));
  });
