# Wrapper

A smart contract-based liquidity wrapper that facilitates automated liquidity provision and token swaps with multi-oracle price validation.

## Overview

The Wrapper is a DeFi protocol that enables users to:
- Add liquidity to Uniswap V2 pools with price validation from multiple oracles
- Execute token swaps with built-in price checks and slippage protection
- Utilize both Chainlink and Pyth Network oracles for accurate price feeds

## Features

- **Multi-Oracle Integration**: Uses both Chainlink and Pyth Network for robust price validation
- **Price Deviation Protection**: Implements a 2% maximum price deviation check between oracles
- **Slippage Control**: Built-in 5% slippage protection for all operations
- **Automated Liquidity Management**: Simplified liquidity provision with USDT
- **Owner Controls**: Ability to update oracle addresses and manage protocol parameters

## Technical Stack

- Solidity ^0.8.20
- Hardhat Development Environment
- OpenZeppelin Contracts
- Uniswap V2 Integration
- Chainlink Price Feeds
- Pyth Network Oracle

## Quick Start

Follow these steps to run the project locally:

1. Start a local Hardhat node with Mainnet fork:
```bash
npx hardhat node --fork https://eth-mainnet.g.alchemy.com/v2/ALXQXTVc8DCrh8ZMnu2F_7Foac_oWBPk
```

2. Open a new terminal (Git Bash recommended) and navigate to the project directory

3. Deploy contracts and update oracles:
```bash
# Deploy contracts
npx hardhat run scripts/deploy.ts --network localhost

# Update Pyth oracle price
npx hardhat update-pyth --network localhost

# Get current prices from all oracles
npx hardhat get-price --network localhost
```

Note: Make sure to run these commands in the order specified above, as the deployment needs to complete before running other commands.

## Security

- Maximum price deviation between oracles: 2%
- Maximum slippage tolerance: 5%