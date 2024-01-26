import { MedusaContainer, OrderService } from "@medusajs/medusa";
import { StockLocation } from "@medusajs/stock-location/dist/models";
import StockLocationService from "@medusajs/stock-location/dist/services/stock-location";
import { BaseService } from "medusa-interfaces";
import TelegramNotificationService from "medusa-telegram-notification/src/services/telegram-notification";
import { TelegramNotificationSendMessageRequestPayload } from "medusa-telegram-notification/src/types";

const MEDUSA_ADMIN_BASE_URL = process.env.MEDUSA_ADMIN_BASE_URL;

class TelegramService extends BaseService {
  private readonly _telegramNotificationService: TelegramNotificationService;
  private readonly _orderService: OrderService;
  private readonly _stockLocationService: StockLocationService;

  constructor(container: MedusaContainer) {
    super(container);

    this._telegramNotificationService = container.resolve(
      "telegramNotificationService"
    );
    this._orderService = container.resolve("orderService");
    this._stockLocationService = container.resolve("stockLocationService");
  }

  public async sendMessageOnOrderPlacedAsync(orderId: string): Promise<void> {
    const order = await this._orderService.retrieve(orderId, {
      relations: [
        "cart",
        "customer",
        "shipping_address",
        "region",
        "currency",
        "shipping_methods",
        "payments",
        "sales_channel",
        "sales_channels",
      ],
    });
    const telegramGroupIds: string[] = [];
    const stockLocations: Record<string, StockLocation | null> = {};
    for (const location of order.sales_channel.locations) {
      stockLocations[location.location_id] = null;
    }

    const stockLocationIds = Object.keys(stockLocations);
    const stockLocationsResponse = await this._stockLocationService.list({
      id: stockLocationIds,
    });
    for (const location of stockLocationsResponse) {
      if (!Object.keys(location.metadata).includes("telegram_group_id")) {
        continue;
      }

      telegramGroupIds.push(location.metadata["telegram_group_id"] as string);
    }

    if (telegramGroupIds.length <= 0) {
      return;
    }

    const customerInfo = `${[order.customer.email, order.customer.phone]
      .filter((e) => e)
      .join(" - ")}`;

    let address = `${order?.shipping_address?.address_1}${
      order?.shipping_address?.address_2 &&
      ", " + order?.shipping_address.address_2
    } ${order?.shipping_address?.city}, ${order?.shipping_address?.province} ${
      order?.shipping_address?.postal_code
    } ${order?.shipping_address?.country_code?.toUpperCase()}`;
    const totalAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: order.currency.code.toUpperCase(),
    }).format(order.paid_total);
    const message = [
      `💌 Order *#${order.display_id}* placed successfully`,
      `📝 Order details: [view](${MEDUSA_ADMIN_BASE_URL}/a/orders/${order.id})`,
      `🍭 Customer: ${customerInfo} ([details](${MEDUSA_ADMIN_BASE_URL}/a/customers/${order.customer.id}))`,
      `💰 Total amount: ${totalAmount.toString()}`,
      `🚚 Shipping address: ${address}`,
    ].join("\n");

    const payload: TelegramNotificationSendMessageRequestPayload = {
      chat_ids: telegramGroupIds,
      text: message,
      parse_mode: "Markdown",
    };

    this._telegramNotificationService.sendMessage(payload);
  }
}

export default TelegramService;
