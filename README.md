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

## Development

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Fork
npx hardhat node

# Deploy
npx hardhat run scripts/deploy.ts --network localhost

# Get Price
npx hardhat get-price --network localhost

# Check Balances
npx hardhat check-balances --network localhost

# Liquidity adding
npx hardhat add-liquidity-usdt --amount 1000 --network localhost

```

## Security

- Maximum price deviation between oracles: 2%
- Maximum slippage tolerance: 5%