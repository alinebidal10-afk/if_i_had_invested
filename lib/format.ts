const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const money = (n: number) => usd.format(n);

export const percent = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
