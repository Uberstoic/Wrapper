import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";
import "./tasks/wrapper-tasks";

dotenv.config();

// Contract addresses
const contractConfig = {
  mainnet: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", // BTC/USD Price Feed
    pythMainnet: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",  // Pyth Network Contract
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  },
  sepolia: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", // BTC/USD Price Feed on Sepolia
    pythMainnet: "0x2880aB155794e7179c9eE2E38200202908C17B43",  // Pyth Network Contract on Sepolia
    usdt: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06"  // Mock USDT on Sepolia
  }
};

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`
        // Using latest block
      },
      mining: {
        auto: true,
        interval: 0
      },
      gasPrice: "auto"
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};

export default config;
export { contractConfig };
