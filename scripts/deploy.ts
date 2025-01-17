import { ethers, network, run } from "hardhat";
import fs from "fs";
import path from "path";

interface NetworkConfig {
  uniswapRouter: string;
  chainlinkBtcUsd: string;
  pythMainnet: string;
  usdtMainnet: string;
  uniswapFactory: string;
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
    uniswapFactory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    blockConfirmations: 5,
    verifyTimeout: 60000 // 1 minute
  },
  sepolia: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    pythMainnet: "0x2880aB155794e7179c9eE2e38200202908C17B43",
    usdtMainnet: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
    uniswapFactory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    blockConfirmations: 3,
    verifyTimeout: 45000 // 45 seconds
  },
  localhost: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainlinkBtcUsd: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    pythMainnet: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
    usdtMainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    uniswapFactory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
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
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localDate = new Date(now.getTime() - offset).toISOString().split('T')[0];
  
  const filename = `${info.network}_${localDate}.json`;
  
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

async function createUniswapPair(
  factoryAddress: string,
  token0Address: string,
  token1Address: string,
  deployer: any
): Promise<string> {
  console.log("\nCreating Uniswap pair...");
  const factory = await ethers.getContractAt(
    "contracts/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory",
    factoryAddress
  );
  
  // Check if pair already exists
  let pairAddress = await factory.getPair(token0Address, token1Address);
  
  if (pairAddress === ethers.constants.AddressZero) {
    console.log("Creating new pair...");
    const tx = await factory.createPair(token0Address, token1Address);
    await tx.wait();
    pairAddress = await factory.getPair(token0Address, token1Address);
    console.log("✅ Pair created at:", pairAddress);
  } else {
    console.log("Pair already exists at:", pairAddress);
  }
  
  return pairAddress;
}

async function addInitialLiquidity(
  router: any,
  token: any,
  usdt: any,
  deployer: any
) {
  console.log("\n💰 Adding initial liquidity...");
  
  // Define amounts
  const tokenAmount = ethers.utils.parseEther("100");  // 100 BTC
  const usdtAmount = ethers.utils.parseUnits("3000000", 6);  // 3M USDT (30k USD per BTC)
  
  console.log(`Token amount: ${ethers.utils.formatEther(tokenAmount)} BTC`);
  console.log(`USDT amount: ${ethers.utils.formatUnits(usdtAmount, 6)} USDT`);
  
  // Mint tokens
  console.log("\n🔄 Minting tokens...");
  const mintTokenTx = await token.mint(deployer.address, tokenAmount);
  await mintTokenTx.wait();
  const mintUsdtTx = await usdt.mint(deployer.address, usdtAmount);
  await mintUsdtTx.wait();
  console.log("✅ Tokens minted");
  
  // Check balances
  const tokenBalance = await token.balanceOf(deployer.address);
  const usdtBalance = await usdt.balanceOf(deployer.address);
  console.log(`Token balance: ${ethers.utils.formatEther(tokenBalance)} BTC`);
  console.log(`USDT balance: ${ethers.utils.formatUnits(usdtBalance, 6)} USDT`);
  
  // Approve tokens
  console.log("\n🔄 Approving router...");
  const approveTokenTx = await token.approve(router.address, tokenAmount);
  await approveTokenTx.wait();
  const approveUsdtTx = await usdt.approve(router.address, usdtAmount);
  await approveUsdtTx.wait();
  console.log("✅ Router approved");
  
  // Check allowances
  const tokenAllowance = await token.allowance(deployer.address, router.address);
  const usdtAllowance = await usdt.allowance(deployer.address, router.address);
  console.log(`Token allowance: ${ethers.utils.formatEther(tokenAllowance)} BTC`);
  console.log(`USDT allowance: ${ethers.utils.formatUnits(usdtAllowance, 6)} USDT`);
  
  // Add liquidity
  console.log("\n🔄 Adding liquidity...");
  try {
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    console.log("Parameters:", {
      token: token.address,
      usdt: usdt.address,
      tokenAmount: tokenAmount.toString(),
      usdtAmount: usdtAmount.toString(),
      tokenMin: "0",
      usdtMin: "0",
      to: deployer.address,
      deadline: deadline
    });
    
    const addLiquidityTx = await router.addLiquidity(
      token.address,
      usdt.address,
      tokenAmount,
      usdtAmount,
      0, // min token amount
      0, // min usdt amount
      deployer.address,
      deadline,
      { gasLimit: 5000000 } // Set explicit gas limit
    );
    
    await addLiquidityTx.wait();
    console.log("✅ Liquidity added successfully");
    
    // Get pair address and check reserves
    const factory = await ethers.getContractAt(
      "contracts/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory",
      NETWORK_CONFIG[network.name].uniswapFactory
    );
    const pairAddress = await factory.getPair(token.address, usdt.address);
    const pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
    const reserves = await pair.getReserves();
    console.log("\nPair reserves:", {
      reserve0: reserves[0].toString(),
      reserve1: reserves[1].toString()
    });
  } catch (error) {
    console.error("⚠️ Failed to add initial liquidity:", error);
    throw error;
  }
}

async function initializeTokenAndRouter(
  wrapper: any,
  token: any,
  usdt: any,
  router: any,
  deployer: any,
  config: any
) {
  console.log("\n🔄 Initializing tokens and router...");

  // Mint initial tokens for testing
  console.log("\n💰 Minting initial tokens...");
  const tokenAmount = ethers.utils.parseEther("100");
  const usdtAmount = ethers.utils.parseUnits("3000000", 6);
  
  await token.mint(deployer.address, tokenAmount);
  await usdt.mint(deployer.address, usdtAmount);

  // Approve router and wrapper
  console.log("\n✍️ Approving tokens for router...");
  await token.approve(router.address, tokenAmount);
  await usdt.approve(router.address, usdtAmount);

  // Check if liquidity already exists
  const factory = await ethers.getContractAt(
    "contracts/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory",
    config.uniswapFactory
  );
  const pairAddress = await factory.getPair(token.address, usdt.address);
  const pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
  const [reserve0, reserve1] = await pair.getReserves();

  if (reserve0.eq(0) && reserve1.eq(0)) {
    console.log("\n💧 Adding initial liquidity...");
    try {
      await router.addLiquidity(
        token.address,
        usdt.address,
        tokenAmount,
        usdtAmount,
        0,
        0,
        deployer.address,
        Math.floor(Date.now() / 1000) + 3600,
        { gasLimit: 5000000 }
      );
    } catch (error) {
      console.error("⚠️ Failed to add initial liquidity:", error);
    }
  } else {
    console.log("\n💧 Liquidity already exists, skipping...");
    console.log("Reserves:", {
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString()
    });
  }

  console.log("\n✍️ Approving tokens for wrapper...");
  await token.approve(wrapper.address, tokenAmount);
  await usdt.approve(wrapper.address, usdtAmount);
}

async function main() {
  // Check prerequisites and get network config
  const { networkName, config, deployer } = await checkPrerequisites();
  const isTestnet = networkName !== "mainnet";

  console.log("\nDeploying contracts with the account:", deployer.address);

  // Deploy Mock Token if on testnet
  console.log("\nDeploying Mock BTC...");
  const tokenFactory = await ethers.getContractFactory("MockERC20");
  const token = isTestnet
    ? await deployContract("MockERC20", tokenFactory, ["Bitcoin Token", "BTC", 18])
    : null;
  
  // Get or deploy USDT
  console.log("\nDeploying Mock USDT...");
  const usdt = isTestnet
    ? await deployContract("MockERC20", tokenFactory, ["Mock USDT", "USDT", 6])
    : await ethers.getContractAt("IERC20", config.usdtMainnet);

  // Create Uniswap pair and add initial liquidity
  const tokenAddress = isTestnet ? token.address : config.usdtMainnet;
  const usdtAddress = isTestnet ? usdt.address : config.usdtMainnet;
  
  // Sort token addresses (Uniswap requires token0 < token1)
  const [token0Address, token1Address] = tokenAddress.toLowerCase() < usdtAddress.toLowerCase()
    ? [tokenAddress, usdtAddress]
    : [usdtAddress, tokenAddress];

  // Create Uniswap pair
  const pairAddress = await createUniswapPair(
    config.uniswapFactory,
    token0Address,
    token1Address,
    deployer
  );

  if (isTestnet) {
    await addInitialLiquidity(
      await ethers.getContractAt("IUniswapV2Router02", config.uniswapRouter),
      token,
      usdt,
      deployer
    );
  }

  // Deploy TWAP Oracle
  console.log("\nDeploying UniswapTWAPOracle...");
  const twapOracle = await ethers.getContractAt("IUniswapTWAPOracle", config.uniswapFactory);

  // Deploy LiquidityWrapper
  console.log("\nDeploying LiquidityWrapper...");
  const wrapperFactory = await ethers.getContractFactory("LiquidityWrapper");
  const wrapper = await deployContract("LiquidityWrapper", wrapperFactory, [
    config.uniswapRouter,
    config.chainlinkBtcUsd,
    config.pythMainnet,
    twapOracle.address,
    tokenAddress,
    usdtAddress
  ]);

  // Initialize tokens and router if on testnet
  if (isTestnet) {
    console.log("\n🔄 Initializing tokens and router...");
    await initializeTokenAndRouter(
      wrapper,
      token,
      usdt,
      await ethers.getContractAt("IUniswapV2Router02", config.uniswapRouter),
      deployer,
      config
    );
  }

  // Save deployment info
  const deploymentInfo = {
    network: networkName,
    deployer: deployer.address,
    token: token?.address || config.usdtMainnet,
    usdt: usdt.address,
    uniswapPair: pairAddress,
    twapOracle: twapOracle.address,
    wrapper: wrapper.address
  };

  await saveDeploymentInfo(deploymentInfo);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
