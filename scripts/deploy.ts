import { ethers, network, run } from "hardhat";
import fs from "fs";
import path from "path";

interface NetworkConfig {
  uniswapRouter: string;
  chainlinkBtcUsd: string;
  pythMainnet: string;
  usdtMainnet: string;
  blockConfirmations: number;
  verifyTimeout: number;
}

// Network specific configurations
const NETWORK_CONFIG: Record<string, NetworkConfig> = {
  mainnet: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    pythMainnet: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
    usdtMainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    blockConfirmations: 5,
    verifyTimeout: 60000 // 1 minute
  },
  sepolia: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    pythMainnet: "0x2880aB155794e7179c9eE2e38200202908C17B43",
    usdtMainnet: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
    blockConfirmations: 3,
    verifyTimeout: 45000 // 45 seconds
  },
  localhost: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", // Using mainnet addresses since we're forking
    pythMainnet: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
    usdtMainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    blockConfirmations: 1,
    verifyTimeout: 0
  }
};

async function verifyContract(
  name: string,
  address: string,
  constructorArguments: any[],
  timeout: number
): Promise<boolean> {
  console.log(`\nVerifying ${name}...`);
  
  try {
    // Add delay before verification to ensure the contract is deployed
    if (timeout > 0) {
      console.log(`Waiting ${timeout/1000} seconds before verification...`);
      await new Promise(resolve => setTimeout(resolve, timeout));
    }

    await run("verify:verify", {
      address: address,
      constructorArguments: constructorArguments,
    });
    
    console.log(`✅ ${name} verified successfully`);
    return true;
  } catch (error: any) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log(`ℹ️ ${name} is already verified`);
      return true;
    } else {
      console.error(`❌ Error verifying ${name}:`, error);
      return false;
    }
  }
}

async function saveDeploymentInfo(info: any) {
  const deploymentDir = path.join(__dirname, "../deployments");
  const filename = `${info.network}_${new Date().toISOString().split('T')[0]}.json`;
  
  // Create deployments directory if it doesn't exist
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }

  // Save deployment info
  const filepath = path.join(deploymentDir, filename);
  fs.writeFileSync(
    filepath,
    JSON.stringify(
      {
        ...info,
        timestamp: new Date().toISOString(),
        chainId: network.config.chainId
      },
      null,
      2
    )
  );
  console.log(`\nDeployment info saved to: ${filepath}`);
}

async function checkPrerequisites() {
  // Check if network is supported
  const networkName = network.name;
  const config = NETWORK_CONFIG[networkName];
  if (!config) {
    throw new Error(
      `Network ${networkName} not supported. Supported networks: ${Object.keys(NETWORK_CONFIG).join(", ")}`
    );
  }

  // Check if deployer has enough balance
  const [deployer] = await ethers.getSigners();
  const balance = await deployer.getBalance();
  console.log(`\nDeployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${ethers.utils.formatEther(balance)} ETH`);

  if (balance.isZero()) {
    throw new Error("Deployer has no ETH balance");
  }

  return { networkName, config, deployer };
}

async function deployContract(name: string, factory: any, args: any[]) {
  console.log(`\nDeploying ${name}...`);
  const contract = await factory.deploy(...args, {
    gasLimit: 5000000,
    maxFeePerGas: ethers.utils.parseUnits("50", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei")
  });
  await contract.deployed();
  console.log(`✅ ${name} deployed to: ${contract.address}`);
  return contract;
}

async function initializeTokenAndRouter(
  token: any,
  wrapper: any,
  usdt: any,
  router: any,
  deployer: any,
  isTestnet: boolean
) {
  console.log("\n🔄 Initializing tokens and router...");

  // Initial token amount for liquidity
  const initialTokenAmount = ethers.utils.parseEther(isTestnet ? "1000" : "100");
  const initialUsdtAmount = ethers.utils.parseEther(isTestnet ? "30000000" : "3000000");

  // Mint initial tokens if we're on testnet or if token is our own
  if (isTestnet) {
    console.log("\n💰 Minting initial tokens...");
    await token.mint(deployer.address, initialTokenAmount.mul(10));
    if (usdt.mint) { // Check if USDT is mockable (for testnet)
      await usdt.mint(deployer.address, initialUsdtAmount.mul(10));
    }
  }

  // Approve tokens for router
  console.log("\n✍️ Approving tokens for router...");
  await token.approve(router.address, initialTokenAmount.mul(10));
  await usdt.approve(router.address, initialUsdtAmount.mul(10));

  // Add initial liquidity if on testnet
  if (isTestnet) {
    console.log("\n💧 Adding initial liquidity...");
    try {
      await router.addLiquidity(
        usdt.address,
        token.address,
        initialUsdtAmount,
        initialTokenAmount,
        initialUsdtAmount.mul(95).div(100),
        initialTokenAmount.mul(95).div(100),
        deployer.address,
        Math.floor(Date.now() / 1000) + 3600
      );
      console.log("✅ Initial liquidity added successfully");
    } catch (error) {
      console.warn("⚠️ Failed to add initial liquidity:", error);
    }
  }

  // Approve tokens for wrapper
  console.log("\n✍️ Approving tokens for wrapper...");
  await token.approve(wrapper.address, initialTokenAmount.mul(10));
  await usdt.approve(wrapper.address, initialUsdtAmount.mul(10));
}

async function main() {
  // Check prerequisites and get configuration
  const { networkName, config, deployer } = await checkPrerequisites();
  const isTestnet = networkName === "sepolia" || networkName === "localhost";

  // Deploy mock contracts if on localhost
  if (network.name === "localhost" || network.name === "hardhat") {
    console.log("Deploying mock contracts...");
    
    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock BTC", "BTC", 8);
    console.log("Mock BTC deployed to:", token.address);

    const usdt = await MockERC20.deploy("Mock USDT", "USDT", 6);
    console.log("Mock USDT deployed to:", usdt.address);

    // Deploy mock Chainlink oracle
    const MockChainlinkOracle = await ethers.getContractFactory("MockChainlinkOracle");
    const mockChainlinkOracle = await MockChainlinkOracle.deploy();
    console.log("Mock Chainlink Oracle deployed to:", mockChainlinkOracle.address);
    const chainlinkOracleAddress = mockChainlinkOracle.address;

    // Deploy wrapper using mock Chainlink oracle
    const Wrapper = await ethers.getContractFactory("LiquidityWrapper");
    const wrapper = await Wrapper.deploy(
      config.uniswapRouter,
      chainlinkOracleAddress,
      NETWORK_CONFIG.mainnet.pythMainnet,
      token.address,
      usdt.address
    );

    // Initialize if on testnet
    if (isTestnet) {
      console.log("\n🔄 Initializing tokens and router...");
      await initializeTokenAndRouter(
        token,
        wrapper,
        usdt,
        await ethers.getContractAt("IUniswapV2Router02", config.uniswapRouter),
        deployer,
        isTestnet
      );
    }

    // Save deployment info
    await saveDeploymentInfo({
      network: networkName,
      token: token.address,
      usdt: usdt.address,
      wrapper: wrapper.address,
      chainlinkOracle: chainlinkOracleAddress,
      pythOracle: NETWORK_CONFIG.mainnet.pythMainnet,
      deployer: deployer.address
    });
  } else {
    // Deploy Token
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await deployContract("Token", Token, [
      "Synthetic BTC",
      "sBTC",
      ethers.utils.parseEther("1000000")
    ]);

    // Deploy Mock USDT for testing
    const USDT = await ethers.getContractFactory("MockERC20");
    const usdt = await deployContract("MockUSDT", USDT, [
      "Mock USDT",
      "USDT",
      ethers.utils.parseUnits("1000000", 6) // USDT uses 6 decimals
    ]);

    // Deploy wrapper using mainnet oracle addresses
    const Wrapper = await ethers.getContractFactory("LiquidityWrapper");
    const wrapper = await Wrapper.deploy(
      config.uniswapRouter,
      NETWORK_CONFIG.mainnet.chainlinkBtcUsd,  // Use real Chainlink oracle
      NETWORK_CONFIG.mainnet.pythMainnet,       // Use real Pyth oracle
      token.address,
      usdt.address
    );

    // Initialize if on testnet
    if (isTestnet) {
      console.log("\n🔄 Initializing tokens and router...");
      await initializeTokenAndRouter(
        token,
        wrapper,
        usdt,
        await ethers.getContractAt("IUniswapV2Router02", config.uniswapRouter),
        deployer,
        isTestnet
      );
    }

    // Save deployment info
    await saveDeploymentInfo({
      network: networkName,
      token: token.address,
      usdt: usdt.address,
      wrapper: wrapper.address,
      chainlinkOracle: NETWORK_CONFIG.mainnet.chainlinkBtcUsd,
      pythOracle: NETWORK_CONFIG.mainnet.pythMainnet,
      deployer: deployer.address
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
