import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Configuration for mainnet fork
  const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  const CHAINLINK_BTC_USD = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c";
  const PYTH_MAINNET = "0x4305FB66699C3B2702D4d05CF36551390A4c69C6";
  const USDT_MAINNET = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  console.log("\nDeploying Token Contract...");
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("Synthetic BTC", "sBTC", ethers.utils.parseEther("1000000"));
  await token.deployed();
  console.log("Token deployed to:", token.address);

  console.log("\nDeploying LiquidityWrapper...");
  const Wrapper = await ethers.getContractFactory("LiquidityWrapper");
  const wrapper = await Wrapper.deploy(
    UNISWAP_ROUTER,
    CHAINLINK_BTC_USD,
    PYTH_MAINNET,
    token.address,
    USDT_MAINNET
  );
  await wrapper.deployed();

  console.log("LiquidityWrapper deployed to:", wrapper.address);
  console.log("\nDeployment completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
