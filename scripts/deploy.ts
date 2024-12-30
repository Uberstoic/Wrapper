import { ethers, network, run } from "hardhat";

// Network specific configurations
const NETWORK_CONFIG = {
  mainnet: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    pythMainnet: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
    usdtMainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  },
  sepolia: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    pythMainnet: "0x2880aB155794e7179c9eE2e38200202908C17B43",
    usdtMainnet: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06"
  }
};

async function verifyContract(address: string, constructorArguments: any[]) {
  console.log("Verifying contract...");
  try {
    await run("verify:verify", {
      address: address,
      constructorArguments: constructorArguments,
    });
    console.log("Contract verified successfully");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("Contract is already verified!");
    } else {
      console.error("Error verifying contract:", error);
    }
  }
}

async function main() {
  // Get network configuration
  const networkName = network.name;
  console.log(`Deploying to network: ${networkName}`);
  
  const config = NETWORK_CONFIG[networkName as keyof typeof NETWORK_CONFIG];
  if (!config) {
    throw new Error(`Network ${networkName} not supported`);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy Token
  console.log("\nDeploying Token Contract...");
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("Synthetic BTC", "sBTC", ethers.utils.parseEther("1000000"));
  await token.deployed();
  console.log("Token deployed to:", token.address);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await token.deployTransaction.wait(5);

  // Deploy Wrapper
  console.log("\nDeploying LiquidityWrapper...");
  const Wrapper = await ethers.getContractFactory("LiquidityWrapper");
  const wrapper = await Wrapper.deploy(
    config.uniswapRouter,
    config.chainlinkBtcUsd,
    config.pythMainnet,
    token.address,
    config.usdtMainnet
  );
  await wrapper.deployed();
  console.log("LiquidityWrapper deployed to:", wrapper.address);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await wrapper.deployTransaction.wait(5);

  // Verify contracts if not on localhost
  if (networkName !== "hardhat" && networkName !== "localhost") {
    // Verify Token
    await verifyContract(token.address, [
      "Synthetic BTC",
      "sBTC",
      ethers.utils.parseEther("1000000")
    ]);

    // Verify Wrapper
    await verifyContract(wrapper.address, [
      config.uniswapRouter,
      config.chainlinkBtcUsd,
      config.pythMainnet,
      token.address,
      config.usdtMainnet
    ]);
  }

  // Save deployment info
  const deploymentInfo = {
    network: networkName,
    token: token.address,
    wrapper: wrapper.address,
    timestamp: new Date().toISOString()
  };

  console.log("\nDeployment Info:", deploymentInfo);
  console.log("\nDeployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
