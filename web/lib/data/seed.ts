import type {
  Approval,
  Billing,
  BusinessSettings,
  Channel,
  ChannelAccount,
  Conversation,
  Customer,
  Message,
  Order,
  OrderStatus,
  Product,
  Receipt,
  TeamMember,
} from './types';
export const SAMPLE_VENDOR = 'sample-adire-by-tola';
export const channelNames: Channel[] = ['whatsapp', 'instagram', 'facebook', 'tiktok', 'email'];
export interface Seed {
  products: Product[];
  customers: Customer[];
  conversations: Conversation[];
  messages: Message[];
  approvals: Approval[];
  orders: Order[];
  receipts: Receipt[];
  channels: ChannelAccount[];
  settings: BusinessSettings;
  team: TeamMember[];
  billing: Billing;
}
export function createSeed(vendorId = SAMPLE_VENDOR): Seed {
  const base = { vendorId };
  const entries: [string, Product['category'], number, Product['kind']][] = [
    ['Indigo Adire Set', 'Fashion', 25000, 'product'],
    ['Ankara Wrap Dress', 'Fashion', 32000, 'product'],
    ['Linen Two-piece', 'Fashion', 45000, 'product'],
    ['Aso Oke Cap', 'Fashion', 12000, 'product'],
    ['Everyday Kaftan', 'Fashion', 28000, 'product'],
    ['Shea Body Butter', 'Beauty', 6500, 'product'],
    ['Black Soap Bar', 'Beauty', 2500, 'product'],
    ['Hibiscus Hair Oil', 'Beauty', 7500, 'product'],
    ['Lip Care Duo', 'Beauty', 4000, 'product'],
    ['Skincare Gift Box', 'Beauty', 18000, 'product'],
    ['Zobo Concentrate', 'Food & drink', 3500, 'product'],
    ['Chin Chin Jar', 'Food & drink', 4500, 'product'],
    ['Suya Spice Mix', 'Food & drink', 2000, 'product'],
    ['Small Chops Platter', 'Food & drink', 22000, 'made-to-order'],
    ['Celebration Cake', 'Food & drink', 55000, 'made-to-order'],
    ['Raffia Storage Basket', 'Home', 16000, 'product'],
    ['Adire Cushion Cover', 'Home', 8500, 'product'],
    ['Soy Scented Candle', 'Home', 9500, 'product'],
    ['Handwoven Table Runner', 'Home', 14000, 'product'],
    ['Ceramic Mug', 'Home', 6000, 'product'],
    ['Beaded Tote Bag', 'Accessories', 18500, 'product'],
    ['Brass Drop Earrings', 'Accessories', 5500, 'product'],
    ['Black Sneakers', 'Shoes', 21000, 'product'],
    ['Personal Styling Session', 'Services', 30000, 'service'],
    ['Bespoke Bridal Outfit', 'Custom', 150000, 'made-to-order'],
  ];
  const products = entries.map(([name, category, price, kind], i): Product => ({
    ...base,
    id: `product-${i + 1}`,
    name,
    category,
    description:
      kind === 'service'
        ? 'One-hour personal styling consultation.'
        : kind === 'made-to-order'
          ? 'Made for you. Timing confirmed before the order.'
          : 'Thoughtfully sourced and packed in Lagos.',
    kind,
    photos: [],
    details: {
      sizes: category === 'Shoes' ? ['42'] : [],
      portion: category === 'Food & drink' ? 'One portion' : '',
      prepMinutes: category === 'Food & drink' ? 30 : null,
      durationMinutes: kind === 'service' ? 60 : null,
    },
    lowStockThreshold: 5,
    archived: false,
    revision: 1,
    priceKobo: price * 100,
    lowestPriceKobo: Math.round(price * 0.9) * 100,
    stock: kind === 'product' ? (i < 5 ? 8 : i === 5 ? 3 : i === 6 ? 0 : 8 + i) : null,
    variants:
      i < 5
        ? [
            { id: `variant-${i + 1}-m`, name: 'Medium / Indigo', priceKobo: price * 100, stock: 5 },
            { id: `variant-${i + 1}-l`, name: 'Large / Indigo', priceKobo: price * 100, stock: 3 },
          ]
        : [],
  }));
  const names = [
    'Chidinma Okafor',
    'Musa Bello',
    'Adaeze Nwosu',
    'Tunde Bakare',
    'Amina Yusuf',
    'Blessing Eze',
    'Femi Adeyemi',
    'Zainab Lawal',
    'Ifeoma Obi',
    'Emeka Nnamdi',
    'Seyi Afolabi',
    'Fatima Ibrahim',
    'Bisi Ogunleye',
    'Kelechi Umeh',
    'Halima Sani',
    'Damilola Cole',
    'Ngozi Nduka',
    'Yusuf Ahmed',
    'Temi Balogun',
    'Esther Udo',
    'Nneka Okeke',
    'Bola Alabi',
    'Abubakar Ali',
    'Ruth Edet',
    'Tobi Ajayi',
    'Maryam Garba',
    'Chika Opara',
    'Dele Ojo',
    'Victoria Ekanem',
    'Ibrahim Usman',
    'Yetunde Akin',
    'Samuel Osei',
    'Olamide James',
    'Grace Uche',
    'Hauwa Mohammed',
    'Kunle Salami',
    'Amaka Ibe',
    'David Danjuma',
    'Funke Williams',
    'Peter Essien',
  ];
  const now = Date.now();
  const at = (minutes: number) => new Date(now - minutes * 60000).toISOString();
  const customers = names.map((name, i): Customer => ({
    ...base,
    id: `customer-${i + 1}`,
    name,
    notes: '',
    tags: i % 4 === 0 ? ['Returning customer'] : [],
    flagged: false,
    email: `customer${i + 1}@example.test`,
    phone: null,
    city: (['Lagos', 'Abuja', 'Ibadan'] as const)[i % 3],
    language: i % 2 ? 'en' : 'pcm',
    createdAt: at(1440 + i),
  }));
  const conversations = customers.map((c, i): Conversation => ({
    ...base,
    id: `conversation-${i + 1}`,
    customerId: c.id,
    customerName: c.name,
    stage: (['new', 'interested', 'ready_to_pay', 'paid', 'cold'] as const)[i % 5],
    threadUrl: null,
    suggestedReplies: [
      'Hello! How can I help?',
      'Let me check that for you.',
      'Thank you for your patience.',
    ],
    channel: channelNames[i % 5],
    status: i % 9 === 8 ? 'resolved' : 'open',
    unreadCount: i < 12 ? 1 : 0,
    lastMessage:
      i % 2
        ? 'Hello! Is the indigo adire set still available?'
        : 'Abeg, the adire still dey? How much delivery?',
    updatedAt: at(i * 7),
    humanModeUntil: null,
  }));
  const messages = conversations.flatMap((c, i): Message[] => [
    {
      ...base,
      id: `message-${i + 1}-1`,
      conversationId: c.id,
      sender: 'customer',
      kind: 'text',
      text:
        i % 2
          ? 'Good afternoon! I saw your page and love your pieces.'
          : 'How far! I see your fine adire for your page.',
      voice: null,
      status: 'received',
      language: i % 2 ? 'en' : 'pcm',
      createdAt: at(i * 7 + 2),
    },
    {
      ...base,
      id: `message-${i + 1}-2`,
      conversationId: c.id,
      sender: 'ai',
      kind: 'text',
      text:
        i % 2
          ? 'Welcome! Happy to help you find something lovely.'
          : 'Welcome! We dey here for you. Wetin you dey look for?',
      voice: null,
      status: 'sent',
      language: i % 2 ? 'en' : 'pcm',
      createdAt: at(i * 7 + 1),
    },
    {
      ...base,
      id: `message-${i + 1}-3`,
      conversationId: c.id,
      sender: 'customer',
      kind: i % 6 === 0 ? 'voice' : 'text',
      text: i % 6 === 0 ? '' : c.lastMessage,
      voice:
        i % 6 === 0 ? { durationSeconds: 18 + i, transcript: c.lastMessage, audioUrl: null } : null,
      status: 'received',
      language: i % 2 ? 'en' : 'pcm',
      createdAt: c.updatedAt,
    },
  ]);
  const statuses: OrderStatus[] = [
    'draft',
    'awaiting_payment',
    'paid',
    'preparing',
    'out_for_delivery',
    'delivered',
    'cancelled',
  ];
  const fees = { Lagos: 250000, Abuja: 500000, Ibadan: 300000 };
  const orders = Array.from({ length: 21 }, (_, i): Order => {
    const c = customers[i];
    const p = products[i % products.length];
    const status = statuses[i % 7];
    const paid = ['paid', 'preparing', 'out_for_delivery', 'delivered'].includes(status);
    const quantity = i === 0 ? 4 : 1;
    return {
      ...base,
      id: `order-${i + 1}`,
      revision: 1,
      conversationId: conversations[i].id,
      deliveryAddress: `${12 + i} ${c.city === 'Lagos' ? 'Adetokunbo Ademola Street, Victoria Island' : c.city === 'Abuja' ? 'Gimbiya Street, Garki' : 'Bodija Road, Bodija'}, ${c.city}, Nigeria`,
      paymentScreenshotReceived: i === 0,
      paymentLink:
        status === 'draft' ? null : `https://paystack.com/pay/selvora-sample-do-not-pay-${i + 1}`,
      paidAt: paid ? at(i * 120) : null,
      stockMovements: [],
      timeline: [
        {
          id: `order-${i + 1}-created`,
          at: at(i * 120 + 10),
          label: 'Draft created',
          customerMessage: null,
        },
        ...(status !== 'draft'
          ? [
              {
                id: `order-${i + 1}-seed`,
                at: at(i * 120),
                label: paid
                  ? 'Payment verified · sample history'
                  : status === 'cancelled'
                    ? 'Order cancelled'
                    : 'Awaiting payment',
                customerMessage: null,
              },
            ]
          : []),
      ],
      customerId: c.id,
      customerName: c.name,
      items: [
        {
          productId: p.id,
          name: p.name,
          variantId: p.variants[0]?.id ?? null,
          variantName: p.variants[0]?.name ?? null,
          quantity,
          unitPriceKobo: p.priceKobo,
        },
      ],
      status,
      city: c.city,
      deliveryFeeKobo: fees[c.city],
      totalKobo: p.priceKobo * quantity + fees[c.city],
      paymentStatus: paid ? 'paid' : 'unpaid',
      paymentSource: paid ? (i % 2 ? 'vendor' : 'paystack') : null,
      createdAt: at(i * 120),
    };
  });
  const receipts = orders
    .filter((o) => o.paymentStatus === 'paid')
    .map((o, i): Receipt => ({
      ...base,
      id: `receipt-${i + 1}`,
      orderId: o.id,
      number: i + 1,
      vendorName: 'Adire by Tola',
      subtotalKobo: o.items.reduce((n, item) => n + item.quantity * item.unitPriceKobo, 0),
      paymentSource: o.paymentSource!,
      shareUrl: null,
      totalKobo: o.totalKobo,
      items: structuredClone(o.items),
      deliveryFeeKobo: o.deliveryFeeKobo,
      customerName: o.customerName,
      issuedAt: o.createdAt,
    }));
  const reasons: Approval['reason'][] = [
    'discount_below_floor',
    'bulk_order',
    'complaint',
    'refund',
    'low_confidence',
  ];
  const requests = [
    'Can you do ₦18,000 for the adire?',
    'Abeg I need 40 pieces for our association.',
    'My parcel never reach. I no happy at all.',
    'Please I would like a refund for my order.',
    'Can you match an unusual fabric colour for me?',
  ];
  const approvals = reasons.map((reason, i): Approval => ({
    ...base,
    id: `approval-${i + 1}`,
    conversationId: conversations[i].id,
    messageId: `message-approval-${i + 1}`,
    customerMessage: requests[i],
    holdingReplySentAt: null,
    facts: [
      {
        label: 'Product',
        value: products[0].name,
        sourceId: products[0].id,
        sourceRevision: products[0].revision,
      },
      {
        label: 'Stock',
        value: String(products[0].stock),
        sourceId: products[0].id,
        sourceRevision: products[0].revision,
      },
      { label: 'List price', value: '₦25,000', sourceId: products[0].id },
      { label: 'Lowest price', value: '₦22,500', sourceId: products[0].id },
    ],
    proposedReply:
      'Thank you for reaching out. Let me check this with our team and get back to you shortly.',
    reason,
    confidence: reason === 'low_confidence' ? 0.62 : 0.93,
    status: 'pending',
    createdAt: at(1),
    holdingReplyDueAt: new Date(now + 4 * 60000).toISOString(),
  }));
  for (const a of approvals) {
    messages.push({
      ...base,
      id: a.messageId,
      conversationId: a.conversationId,
      sender: 'customer',
      kind: 'text',
      text: a.customerMessage,
      voice: null,
      status: 'received',
      language: 'en',
      createdAt: a.createdAt,
    });
    const c = conversations.find((c) => c.id === a.conversationId)!;
    c.lastMessage = a.customerMessage;
    c.updatedAt = a.createdAt;
  }
  for (const [i, c] of conversations.entries()) {
    const historical = orders.find(
      (o) => o.customerId === c.customerId && o.paymentStatus === 'paid',
    );
    if (c.stage === 'paid' && !historical) c.stage = 'interested';
    const p = products[0];
    messages.push({
      ...base,
      id: `shared-product-${i}`,
      conversationId: c.id,
      sender: 'ai',
      kind: 'text',
      text: 'Here is the item from our catalogue.',
      voice: null,
      status: 'sent',
      language: 'en',
      createdAt: at(i * 7 + 0.5),
      product: {
        id: p.id,
        name: p.name,
        priceKobo: p.priceKobo,
        stock: p.stock,
        revision: p.revision,
      },
    });
    const order = orders.find((o) => o.customerId === c.customerId);
    if (order)
      messages.push({
        ...base,
        id: `shared-order-${i}`,
        conversationId: c.id,
        sender: 'ai',
        kind: 'text',
        text: 'Your order summary.',
        voice: null,
        status: 'sent',
        language: 'en',
        createdAt: order.createdAt,
        order: {
          id: order.id,
          items: structuredClone(order.items),
          totalKobo: order.totalKobo,
          paymentStatus: order.paymentStatus,
          status: order.status,
        },
      });
  }
  return {
    products,
    customers,
    conversations,
    messages,
    orders,
    receipts,
    approvals,
    channels: channelNames.map((channel) => ({
      ...base,
      id: `channel-${channel}`,
      channel,
      displayName: 'Adire by Tola',
      status: 'connected',
      ownAccount: true,
    })),
    settings: {
      ...base,
      id: 'settings',
      businessName: 'Adire by Tola',
      businessType: 'mixed',
      tone: 'Pidgin-friendly',
      autoNegotiation: false,
      autoIntents: [
        'greeting',
        'price',
        'availability',
        'variants',
        'delivery_info',
        'order_status',
        'alternatives',
      ],
      deliveryFees: Object.entries(fees).map(([city, feeKobo]) => ({
        city: city as Customer['city'],
        feeKobo,
      })),
    },
    team: [
      {
        ...base,
        id: 'team-owner',
        name: 'Tola Adeyemi',
        email: 'tola@example.test',
        role: 'owner',
        status: 'active',
      },
      {
        ...base,
        id: 'team-manager',
        name: 'Ada Obi',
        email: 'ada@example.test',
        role: 'manager',
        status: 'active',
      },
      {
        ...base,
        id: 'team-agent',
        name: 'Seyi Bakare',
        email: 'seyi@example.test',
        role: 'agent',
        status: 'invited',
      },
    ],
    billing: {
      ...base,
      id: 'billing',
      plan: 'growth',
      status: 'trial',
      monthlyPriceKobo: 1500000,
      nextBillingAt: new Date(now + 14 * 86400000).toISOString(),
      usage: { conversations: 40, limit: 1000 },
    },
  };
}
