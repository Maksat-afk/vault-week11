# Week 11 — Raydium CLMM

В этой работе я создал два собственных SPL-токена и пул ликвидности Raydium CLMM в Solana Devnet.

Для работы использовал TypeScript, Solana Web3.js и Raydium SDK.

## Что было сделано

1. Создал два SPL-токена: `TOKEN_A` и `TOKEN_B`.
2. Для обоих токенов установил `6 decimals`.
3. Создал Associated Token Accounts для своего кошелька.
4. Выпустил по `1 000 000` токенов каждого вида.
5. Получил конфигурацию комиссии Raydium CLMM.
6. Создал пул с начальной ценой `1 TOKEN_A = 1 TOKEN_B`.
7. Проверил создание пула в Solana Devnet.
8. Проверил начальную цену непосредственно через Raydium SDK и Solana RPC.

Rust-контракт `simple_vault` в этой работе не изменялся.

## Немного теории

**AMM (Automated Market Maker)** — автоматический маркет-мейкер. Он позволяет обменивать токены через пул ликвидности без классического биржевого стакана заявок.

В простой модели AMM используется формула:

```text
x * y = k
```

где `x` и `y` — резервы двух токенов, а `k` — постоянное произведение.

**CLMM (Concentrated Liquidity Market Maker)** — модель, в которой поставщик ликвидности может выбрать диапазон цен, в котором будет работать его ликвидность.

Это позволяет эффективнее использовать капитал, но требует следить за изменением цены.

**Tick spacing** — расстояние между допустимыми тиками, на которых можно устанавливать границы LP-позиций.

В этой работе использовался `tickSpacing = 60`.

Комиссия пула составила `0.25%`.

## Структура проекта

```text
vault-week11/
├── programs/
├── scripts/
│   ├── create-clmm-pool.ts
│   └── verify-clmm-pool.ts
├── tests/
├── Anchor.toml
├── Cargo.toml
├── package.json
├── yarn.lock
└── README.md
```

## Установка

Для работы необходимы:

- Rust
- Solana CLI
- Anchor CLI
- Node.js
- Yarn

Установка зависимостей:

```bash
corepack yarn install
```

Сборка Anchor:

```bash
anchor build
```

## Настройка кошелька

Проверка подключения к Devnet:

```bash
solana config set --url devnet
solana address
solana balance
```

Для создания токенов и пула на кошельке должен быть SOL в Devnet.

Скрипт использует кошелёк из `ANCHOR_WALLET` или стандартный файл:

```text
~/.config/solana/id.json
```

## Создание токенов и пула

Запуск:

```bash
corepack yarn create-pool
```

Скрипт создаёт два токена, выпускает их на кошелёк и создаёт Raydium CLMM pool.

После успешного выполнения создаётся файл `devnet-pool.json` с адресами токенов, token accounts, пула и подписью транзакции.

Этот файл индивидуален для каждого запуска и не добавляется в Git.

## Проверка результата

Проверка общего выпуска TOKEN_A:

```bash
spl-token supply JTg2V39EuNL4yyeRUQsyWnztBtrAoWMTWCABCWDwiFe --url devnet
```

Проверка общего выпуска TOKEN_B:

```bash
spl-token supply DX95crJCjzFdYMXKFKUBKZ7rqNCjjEJjrUUf3XGQbvWd --url devnet
```

Ожидаемый результат для каждого токена:

```text
1000000
```

Проверка транзакции создания пула:

```bash
solana confirm 312GcHWtZtFyQRYgqfj2YDQmYeP47cwqJeTa23t2DkDanEm3s8keo3HMvGmB2YZHnPqY1WhBSZbdnb9Mdot1H2m7 --url devnet
```

Проверка аккаунта пула:

```bash
solana account FKmwCfM1f9nMmCu7yHkQ86BeZsqfQgBLGFCAFozAt8e --url devnet
```

Проверка начальной цены непосредственно из состояния пула:

```bash
corepack yarn verify-pool
```

Результат проверки:

```text
Tick spacing: 60
Цена TOKEN_B за TOKEN_A: 1

SUCCESS: начальная цена соответствует 1:1
```

## Результат в Devnet

**TOKEN_A mint:**

`JTg2V39EuNL4yyeRUQsyWnztBtrAoWMTWCABCWDwiFe`

**TOKEN_B mint:**

`DX95crJCjzFdYMXKFKUBKZ7rqNCjjEJjrUUf3XGQbvWd`

**Raydium CLMM Pool:**

`FKmwCfM1f9nMmCu7yHkQ86BeZsqfQgBLGFCAFozAt8e`

**Raydium CLMM Program:**

`DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH`

**Транзакция создания пула:**

[Открыть транзакцию в Solana Explorer](https://explorer.solana.com/tx/312GcHWtZtFyQRYgqfj2YDQmYeP47cwqJeTa23t2DkDanEm3s8keo3HMvGmB2YZHnPqY1WhBSZbdnb9Mdot1H2m7?cluster=devnet)

**Пул в Solana Explorer:**

[Открыть пул](https://explorer.solana.com/address/FKmwCfM1f9nMmCu7yHkQ86BeZsqfQgBLGFCAFozAt8e?cluster=devnet)

## Важное замечание

В рамках этой работы создаётся только CLMM-пул и задаётся его начальная цена.

LP-позиция и внесение ликвидности не выполняются. Поэтому обменивать токены через этот пул пока нельзя.

Файлы кошельков, приватные ключи и индивидуальный `devnet-pool.json` не нужно добавлять в GitHub.
