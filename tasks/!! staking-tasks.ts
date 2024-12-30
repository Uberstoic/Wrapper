import { task } from "hardhat/config";
import { Contract } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Add your deployed contract addresses here
const STAKING_ADDRESS = "0x039525F2Cb41A76790b0337107f863Ce31fDFa3b";
const LP_TOKEN_ADDRESS = "0x7338be734e425b605F7Bb081B8b48d45eBA48d01";
const REWARD_TOKEN_ADDRESS = "0x657eB176645e44A4128c38730e666A7B201e0Cf9";

task("stake", "Stake LP tokens")
  .addParam("amount", "Amount of LP tokens to stake")
  .setAction(async (taskArgs, hre) => {
    const [signer] = await hre.ethers.getSigners();
    
    // Get contract instances
    const staking = await hre.ethers.getContractAt("Staking", STAKING_ADDRESS, signer);
    const lpToken = await hre.ethers.getContractAt("IERC20", LP_TOKEN_ADDRESS, signer);

    // Check LP token balance first
    const balance = await lpToken.balanceOf(signer.address);
    console.log(`\nYour LP token balance: ${hre.ethers.utils.formatEther(balance)} LP tokens`);

    // Approve staking contract to spend LP tokens
    const amount = hre.ethers.utils.parseEther(taskArgs.amount);
    
    if (balance.lt(amount)) {
        console.log(`Error: Insufficient LP token balance. You have ${hre.ethers.utils.formatEther(balance)} but trying to stake ${taskArgs.amount}`);
        return;
    }
    
    console.log(`Approving ${taskArgs.amount} LP tokens...`);
    const approveTx = await lpToken.approve(STAKING_ADDRESS, amount);
    console.log("Waiting for approve transaction...");
    await approveTx.wait();
    console.log("Approval confirmed!");

    // Check allowance
    const allowance = await lpToken.allowance(signer.address, STAKING_ADDRESS);
    console.log(`Current allowance: ${hre.ethers.utils.formatEther(allowance)} LP tokens`);

    // Stake LP tokens
    console.log(`\nStaking ${taskArgs.amount} LP tokens...`);
    const tx = await staking.stake(amount);
    console.log("Waiting for stake transaction...");
    await tx.wait();
    
    console.log("Staking successful!");
    
    // Get updated stake info
    const stakeInfo = await staking.getUserStakeInfo(signer.address);
    console.log("\nYour Staking Info:");
    console.log(`Staked Amount: ${hre.ethers.utils.formatEther(stakeInfo.stakedAmount)} LP tokens`);
    console.log(`Staking Time: ${new Date(stakeInfo.stakingTime.toNumber() * 1000).toLocaleString()}`);
    console.log(`Pending Rewards: ${hre.ethers.utils.formatEther(stakeInfo.pendingRewards)} tokens`);
  });

task("unstake", "Unstake LP tokens")
  .setAction(async (_, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const staking = await hre.ethers.getContractAt("Staking", STAKING_ADDRESS, signer);

    // Get current stake info
    const stakeInfo = await staking.getUserStakeInfo(signer.address);
    console.log("\nCurrent Staking Info:");
    console.log(`Staked Amount: ${hre.ethers.utils.formatEther(stakeInfo.stakedAmount)} LP tokens`);
    
    // Unstake tokens
    console.log("\nUnstaking tokens...");
    const tx = await staking.unstake();
    await tx.wait();
    
    console.log("Unstaking successful!");
  });

task("claim", "Claim reward tokens")
  .setAction(async (_, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const staking = await hre.ethers.getContractAt("Staking", STAKING_ADDRESS, signer);

    // Get current rewards
    const stakeInfo = await staking.getUserStakeInfo(signer.address);
    console.log(`\nPending Rewards: ${hre.ethers.utils.formatEther(stakeInfo.pendingRewards)} tokens`);
    
    // Claim rewards
    console.log("\nClaiming rewards...");
    const tx = await staking.claim();
    await tx.wait();
    
    console.log("Rewards claimed successfully!");
  });

task("check-rewards", "Check pending rewards without claiming")
  .setAction(async (_, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const staking = await hre.ethers.getContractAt("Staking", STAKING_ADDRESS, signer);

    // Get current stake info
    const stakeInfo = await staking.getUserStakeInfo(signer.address);
    
    console.log("\nYour Staking Info:");
    console.log(`Staked Amount: ${hre.ethers.utils.formatEther(stakeInfo[0])} LP tokens`);
    console.log(`Staking Time: ${new Date(stakeInfo[1].toNumber() * 1000).toLocaleString()}`);
    console.log(`Last Claim Time: ${new Date(stakeInfo[2].toNumber() * 1000).toLocaleString()}`);
    console.log(`Pending Rewards: ${hre.ethers.utils.formatEther(stakeInfo[3])} tokens`);
    
    // Calculate time until unstake available
    const stakingDuration = await staking.stakingDuration();
    const timeUntilUnstake = (stakeInfo[1].toNumber() + stakingDuration.toNumber()) - Math.floor(Date.now() / 1000);
    
    if (timeUntilUnstake > 0) {
      const days = Math.floor(timeUntilUnstake / (24 * 60 * 60));
      const hours = Math.floor((timeUntilUnstake % (24 * 60 * 60)) / (60 * 60));
      const minutes = Math.floor((timeUntilUnstake % (60 * 60)) / 60);
      console.log(`\nTime until unstake available: ${days}d ${hours}h ${minutes}m`);
    } else {
      console.log("\nTokens can be unstaked now!");
    }
  });

task("check-balances", "Check token balances")
  .setAction(async (_, hre) => {
    const [signer] = await hre.ethers.getSigners();
    
    // Get contract instances
    const rewardToken = await hre.ethers.getContractAt("IERC20", REWARD_TOKEN_ADDRESS, signer);
    const lpToken = await hre.ethers.getContractAt("IERC20", LP_TOKEN_ADDRESS, signer);
    
    // Get Uniswap Factory address for Sepolia
    const FACTORY_ADDRESS = "0x7E0987E5b3a30e3f2828572Bb659A548460a3003";
    const factoryAbi = [
      "function getPair(address tokenA, address tokenB) external view returns (address pair)"
    ];
    const factory = new hre.ethers.Contract(FACTORY_ADDRESS, factoryAbi, signer);
    
    // Get LP token address from Uniswap
    const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";  // Sepolia WETH
    const pairAddress = await factory.getPair(REWARD_TOKEN_ADDRESS, WETH_ADDRESS);
    const uniswapLPToken = await hre.ethers.getContractAt("IERC20", pairAddress, signer);

    // Get balances
    const rewardBalance = await rewardToken.balanceOf(signer.address);
    const lpBalance = await lpToken.balanceOf(signer.address);
    const uniswapLPBalance = await uniswapLPToken.balanceOf(signer.address);
    const rewardAllowance = await rewardToken.allowance(signer.address, STAKING_ADDRESS);
    
    console.log("\nYour Balances:");
    console.log(`Reward Token: ${hre.ethers.utils.formatEther(rewardBalance)} tokens`);
    console.log(`Mock LP Token: ${hre.ethers.utils.formatEther(lpBalance)} tokens`);
    console.log(`Uniswap LP Token: ${hre.ethers.utils.formatEther(uniswapLPBalance)} tokens`);
    console.log(`Reward Token Allowance for Staking: ${hre.ethers.utils.formatEther(rewardAllowance)} tokens`);
    console.log(`\nUniswap Pair Address: ${pairAddress}`);
  });

task("set-duration", "Set new staking duration")
  .addParam("duration", "New duration in seconds")
  .setAction(async (taskArgs, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const staking = await hre.ethers.getContractAt("Staking", STAKING_ADDRESS, signer);

    console.log(`\nSetting new staking duration to ${taskArgs.duration} seconds...`);
    const tx = await staking.setStakingDuration(taskArgs.duration);
    await tx.wait();
    
    console.log("Staking duration updated successfully!");
  });

task("set-rate", "Set new reward rate")
  .addParam("rate", "New reward rate (in tokens per second per staked token)")
  .setAction(async (taskArgs, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const staking = await hre.ethers.getContractAt("Staking", STAKING_ADDRESS, signer);

    const rate = hre.ethers.utils.parseEther(taskArgs.rate);
    console.log(`\nSetting new reward rate to ${taskArgs.rate} tokens per second per staked token...`);
    const tx = await staking.setRewardRate(rate);
    await tx.wait();
    
    console.log("Reward rate updated successfully!");
  });

task("fund-pool", "Fund reward pool with tokens")
  .addParam("amount", "Amount of tokens to add to reward pool")
  .setAction(async (taskArgs, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const staking = await hre.ethers.getContractAt("Staking", STAKING_ADDRESS, signer);
    const rewardToken = await hre.ethers.getContractAt("IERC20", REWARD_TOKEN_ADDRESS, signer);

    const amount = hre.ethers.utils.parseEther(taskArgs.amount);
    
    // Approve tokens first
    console.log(`\nApproving ${taskArgs.amount} tokens...`);
    const approveTx = await rewardToken.approve(STAKING_ADDRESS, amount);
    await approveTx.wait();
    console.log("Approval confirmed!");

    // Fund the pool
    console.log(`Funding reward pool with ${taskArgs.amount} tokens...`);
    const tx = await staking.fundRewardPool(amount);
    await tx.wait();
    
    console.log("Reward pool funded successfully!");
  });
