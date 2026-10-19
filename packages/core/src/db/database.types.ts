export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      addresses: {
        Row: {
          area: string | null;
          city: string;
          country_code: string;
          created_at: string;
          customer_id: string;
          emirate: Database['public']['Enums']['uae_emirate'] | null;
          id: string;
          is_default_shipping: boolean;
          label: string | null;
          line1: string;
          line2: string | null;
          phone: string;
          postal_code: string | null;
          recipient_name: string;
          updated_at: string;
        };
        Insert: {
          area?: string | null;
          city: string;
          country_code?: string;
          created_at?: string;
          customer_id: string;
          emirate?: Database['public']['Enums']['uae_emirate'] | null;
          id?: string;
          is_default_shipping?: boolean;
          label?: string | null;
          line1: string;
          line2?: string | null;
          phone: string;
          postal_code?: string | null;
          recipient_name: string;
          updated_at?: string;
        };
        Update: {
          area?: string | null;
          city?: string;
          country_code?: string;
          created_at?: string;
          customer_id?: string;
          emirate?: Database['public']['Enums']['uae_emirate'] | null;
          id?: string;
          is_default_shipping?: boolean;
          label?: string | null;
          line1?: string;
          line2?: string | null;
          phone?: string;
          postal_code?: string | null;
          recipient_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'addresses_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      allowed_order_transitions: {
        Row: {
          from_status: Database['public']['Enums']['order_status'];
          to_status: Database['public']['Enums']['order_status'];
        };
        Insert: {
          from_status: Database['public']['Enums']['order_status'];
          to_status: Database['public']['Enums']['order_status'];
        };
        Update: {
          from_status?: Database['public']['Enums']['order_status'];
          to_status?: Database['public']['Enums']['order_status'];
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_type: string;
          actor_user_id: string | null;
          after: Json | null;
          before: Json | null;
          entity_id: string;
          entity_type: string;
          id: number;
          metadata: Json;
          occurred_at: string;
        };
        Insert: {
          action: string;
          actor_type: string;
          actor_user_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          entity_id: string;
          entity_type: string;
          id?: never;
          metadata?: Json;
          occurred_at?: string;
        };
        Update: {
          action?: string;
          actor_type?: string;
          actor_user_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          entity_id?: string;
          entity_type?: string;
          id?: never;
          metadata?: Json;
          occurred_at?: string;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          added_at: string;
          cart_id: string;
          id: string;
          quantity: number;
          updated_at: string;
          variant_id: string;
        };
        Insert: {
          added_at?: string;
          cart_id: string;
          id?: string;
          quantity: number;
          updated_at?: string;
          variant_id: string;
        };
        Update: {
          added_at?: string;
          cart_id?: string;
          id?: string;
          quantity?: number;
          updated_at?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cart_items_cart_id_fkey';
            columns: ['cart_id'];
            isOneToOne: false;
            referencedRelation: 'carts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cart_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      carts: {
        Row: {
          created_at: string;
          currency: string;
          customer_id: string | null;
          expires_at: string | null;
          guest_token_hash: string | null;
          id: string;
          status: Database['public']['Enums']['cart_status'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          expires_at?: string | null;
          guest_token_hash?: string | null;
          id?: string;
          status?: Database['public']['Enums']['cart_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          expires_at?: string | null;
          guest_token_hash?: string | null;
          id?: string;
          status?: Database['public']['Enums']['cart_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'carts_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      consents: {
        Row: {
          captured_at: string;
          channel: Database['public']['Enums']['consent_channel'];
          customer_id: string | null;
          email: string | null;
          granted: boolean;
          id: string;
          locale: string;
          phone: string | null;
          policy_version: string;
          source: string;
        };
        Insert: {
          captured_at?: string;
          channel: Database['public']['Enums']['consent_channel'];
          customer_id?: string | null;
          email?: string | null;
          granted: boolean;
          id?: string;
          locale?: string;
          phone?: string | null;
          policy_version: string;
          source: string;
        };
        Update: {
          captured_at?: string;
          channel?: Database['public']['Enums']['consent_channel'];
          customer_id?: string | null;
          email?: string | null;
          granted?: boolean;
          id?: string;
          locale?: string;
          phone?: string | null;
          policy_version?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'consents_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          preferred_locale: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          preferred_locale?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          preferred_locale?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      drop_items: {
        Row: {
          created_at: string;
          drop_id: string;
          sort_order: number;
          unit_cap: number | null;
          variant_id: string;
        };
        Insert: {
          created_at?: string;
          drop_id: string;
          sort_order?: number;
          unit_cap?: number | null;
          variant_id: string;
        };
        Update: {
          created_at?: string;
          drop_id?: string;
          sort_order?: number;
          unit_cap?: number | null;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'drop_items_drop_id_fkey';
            columns: ['drop_id'];
            isOneToOne: false;
            referencedRelation: 'drops';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'drop_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      drops: {
        Row: {
          closes_at: string | null;
          created_at: string;
          early_access_at: string | null;
          id: string;
          number: number;
          opens_at: string;
          slug: string;
          status: Database['public']['Enums']['drop_status'];
          title_ar: string | null;
          title_en: string;
          unit_cap: number;
          updated_at: string;
        };
        Insert: {
          closes_at?: string | null;
          created_at?: string;
          early_access_at?: string | null;
          id?: string;
          number: number;
          opens_at: string;
          slug: string;
          status?: Database['public']['Enums']['drop_status'];
          title_ar?: string | null;
          title_en: string;
          unit_cap: number;
          updated_at?: string;
        };
        Update: {
          closes_at?: string | null;
          created_at?: string;
          early_access_at?: string | null;
          id?: string;
          number?: number;
          opens_at?: string;
          slug?: string;
          status?: Database['public']['Enums']['drop_status'];
          title_ar?: string | null;
          title_en?: string;
          unit_cap?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_sync_runs: {
        Row: {
          counts: Json;
          error: string | null;
          finished_at: string | null;
          id: number;
          kind: string;
          provider: string;
          started_at: string;
          status: string;
        };
        Insert: {
          counts?: Json;
          error?: string | null;
          finished_at?: string | null;
          id?: never;
          kind: string;
          provider: string;
          started_at?: string;
          status?: string;
        };
        Update: {
          counts?: Json;
          error?: string | null;
          finished_at?: string | null;
          id?: never;
          kind?: string;
          provider?: string;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      inventory_levels: {
        Row: {
          available: number | null;
          location: Database['public']['Enums']['inventory_location'];
          on_hand: number;
          reserved: number;
          updated_at: string;
          updated_from: Database['public']['Enums']['inventory_source'];
          variant_id: string;
        };
        Insert: {
          available?: number | null;
          location: Database['public']['Enums']['inventory_location'];
          on_hand?: number;
          reserved?: number;
          updated_at?: string;
          updated_from?: Database['public']['Enums']['inventory_source'];
          variant_id: string;
        };
        Update: {
          available?: number | null;
          location?: Database['public']['Enums']['inventory_location'];
          on_hand?: number;
          reserved?: number;
          updated_at?: string;
          updated_from?: Database['public']['Enums']['inventory_source'];
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_levels_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          delta_on_hand: number;
          delta_reserved: number;
          id: number;
          location: Database['public']['Enums']['inventory_location'];
          note: string | null;
          reason: Database['public']['Enums']['inventory_reason'];
          reference_id: string | null;
          reference_type: string | null;
          source: Database['public']['Enums']['inventory_source'];
          variant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          delta_on_hand?: number;
          delta_reserved?: number;
          id?: never;
          location: Database['public']['Enums']['inventory_location'];
          note?: string | null;
          reason: Database['public']['Enums']['inventory_reason'];
          reference_id?: string | null;
          reference_type?: string | null;
          source?: Database['public']['Enums']['inventory_source'];
          variant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          delta_on_hand?: number;
          delta_reserved?: number;
          id?: never;
          location?: Database['public']['Enums']['inventory_location'];
          note?: string | null;
          reason?: Database['public']['Enums']['inventory_reason'];
          reference_id?: string | null;
          reference_type?: string | null;
          source?: Database['public']['Enums']['inventory_source'];
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_movements_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      measurements: {
        Row: {
          created_at: string;
          customer_id: string;
          id: string;
          label: string | null;
          profile: Json;
          taken_at: string;
          taken_by: string;
          unit: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          id?: string;
          label?: string | null;
          profile: Json;
          taken_at?: string;
          taken_by?: string;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          id?: string;
          label?: string | null;
          profile?: Json;
          taken_at?: string;
          taken_by?: string;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'measurements_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      order_events: {
        Row: {
          actor_type: string;
          actor_user_id: string | null;
          created_at: string;
          from_status: Database['public']['Enums']['order_status'] | null;
          id: number;
          metadata: Json;
          order_id: string;
          reason: string | null;
          to_status: Database['public']['Enums']['order_status'];
        };
        Insert: {
          actor_type: string;
          actor_user_id?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['order_status'] | null;
          id?: never;
          metadata?: Json;
          order_id: string;
          reason?: string | null;
          to_status: Database['public']['Enums']['order_status'];
        };
        Update: {
          actor_type?: string;
          actor_user_id?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['order_status'] | null;
          id?: never;
          metadata?: Json;
          order_id?: string;
          reason?: string | null;
          to_status?: Database['public']['Enums']['order_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'order_events_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: {
          colour_ar: string | null;
          colour_en: string;
          created_at: string;
          id: string;
          line_net_fils: number;
          line_total_fils: number;
          line_vat_fils: number;
          order_id: string;
          preorder_ship_date: string | null;
          product_name_ar: string | null;
          product_name_en: string;
          quantity: number;
          size: string;
          sku: string;
          stock_mode: Database['public']['Enums']['stock_mode'];
          unit_price_fils: number;
          variant_id: string | null;
          vat_rate_bp: number;
        };
        Insert: {
          colour_ar?: string | null;
          colour_en: string;
          created_at?: string;
          id?: string;
          line_net_fils: number;
          line_total_fils: number;
          line_vat_fils: number;
          order_id: string;
          preorder_ship_date?: string | null;
          product_name_ar?: string | null;
          product_name_en: string;
          quantity: number;
          size: string;
          sku: string;
          stock_mode: Database['public']['Enums']['stock_mode'];
          unit_price_fils: number;
          variant_id?: string | null;
          vat_rate_bp?: number;
        };
        Update: {
          colour_ar?: string | null;
          colour_en?: string;
          created_at?: string;
          id?: string;
          line_net_fils?: number;
          line_total_fils?: number;
          line_vat_fils?: number;
          order_id?: string;
          preorder_ship_date?: string | null;
          product_name_ar?: string | null;
          product_name_en?: string;
          quantity?: number;
          size?: string;
          sku?: string;
          stock_mode?: Database['public']['Enums']['stock_mode'];
          unit_price_fils?: number;
          variant_id?: string | null;
          vat_rate_bp?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          billing_address: Json | null;
          cart_id: string | null;
          created_at: string;
          currency: string;
          customer_id: string | null;
          delivery_promise_date: string | null;
          drop_id: string | null;
          email: string;
          has_made_to_order_lines: boolean;
          id: string;
          locale: string;
          order_number: string;
          payment_method: Database['public']['Enums']['payment_provider'] | null;
          phone: string | null;
          placed_at: string;
          shipping_address: Json;
          shipping_fils: number;
          status: Database['public']['Enums']['order_status'];
          subtotal_net_fils: number;
          total_fils: number;
          updated_at: string;
          vat_fils: number;
          vat_rate_bp: number;
        };
        Insert: {
          billing_address?: Json | null;
          cart_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          delivery_promise_date?: string | null;
          drop_id?: string | null;
          email: string;
          has_made_to_order_lines?: boolean;
          id?: string;
          locale?: string;
          order_number?: string;
          payment_method?: Database['public']['Enums']['payment_provider'] | null;
          phone?: string | null;
          placed_at?: string;
          shipping_address: Json;
          shipping_fils?: number;
          status?: Database['public']['Enums']['order_status'];
          subtotal_net_fils: number;
          total_fils: number;
          updated_at?: string;
          vat_fils: number;
          vat_rate_bp?: number;
        };
        Update: {
          billing_address?: Json | null;
          cart_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          delivery_promise_date?: string | null;
          drop_id?: string | null;
          email?: string;
          has_made_to_order_lines?: boolean;
          id?: string;
          locale?: string;
          order_number?: string;
          payment_method?: Database['public']['Enums']['payment_provider'] | null;
          phone?: string | null;
          placed_at?: string;
          shipping_address?: Json;
          shipping_fils?: number;
          status?: Database['public']['Enums']['order_status'];
          subtotal_net_fils?: number;
          total_fils?: number;
          updated_at?: string;
          vat_fils?: number;
          vat_rate_bp?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_cart_id_fkey';
            columns: ['cart_id'];
            isOneToOne: false;
            referencedRelation: 'carts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_drop_id_fkey';
            columns: ['drop_id'];
            isOneToOne: false;
            referencedRelation: 'drops';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_fils: number;
          captured_at: string | null;
          created_at: string;
          currency: string;
          id: string;
          order_id: string;
          provider: Database['public']['Enums']['payment_provider'];
          provider_ref: string | null;
          raw_ref: string | null;
          status: Database['public']['Enums']['payment_status'];
          updated_at: string;
        };
        Insert: {
          amount_fils: number;
          captured_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          order_id: string;
          provider: Database['public']['Enums']['payment_provider'];
          provider_ref?: string | null;
          raw_ref?: string | null;
          status?: Database['public']['Enums']['payment_status'];
          updated_at?: string;
        };
        Update: {
          amount_fils?: number;
          captured_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          order_id?: string;
          provider?: Database['public']['Enums']['payment_provider'];
          provider_ref?: string | null;
          raw_ref?: string | null;
          status?: Database['public']['Enums']['payment_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      product_media: {
        Row: {
          alt_ar: string | null;
          alt_en: string;
          created_at: string;
          height: number | null;
          id: string;
          kind: string;
          product_id: string;
          sort_order: number;
          storage_path: string;
          updated_at: string;
          variant_id: string | null;
          width: number | null;
        };
        Insert: {
          alt_ar?: string | null;
          alt_en: string;
          created_at?: string;
          height?: number | null;
          id?: string;
          kind?: string;
          product_id: string;
          sort_order?: number;
          storage_path: string;
          updated_at?: string;
          variant_id?: string | null;
          width?: number | null;
        };
        Update: {
          alt_ar?: string | null;
          alt_en?: string;
          created_at?: string;
          height?: number | null;
          id?: string;
          kind?: string;
          product_id?: string;
          sort_order?: number;
          storage_path?: string;
          updated_at?: string;
          variant_id?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'product_media_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_media_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      product_variants: {
        Row: {
          active: boolean;
          barcode: string | null;
          colour_ar: string | null;
          colour_code: string;
          colour_en: string;
          created_at: string;
          id: string;
          preorder_ship_date: string | null;
          price_fils: number;
          product_id: string;
          size: string;
          sku: string;
          sort_order: number;
          stock_mode: Database['public']['Enums']['stock_mode'];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          barcode?: string | null;
          colour_ar?: string | null;
          colour_code: string;
          colour_en: string;
          created_at?: string;
          id?: string;
          preorder_ship_date?: string | null;
          price_fils: number;
          product_id: string;
          size: string;
          sku: string;
          sort_order?: number;
          stock_mode?: Database['public']['Enums']['stock_mode'];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          barcode?: string | null;
          colour_ar?: string | null;
          colour_code?: string;
          colour_en?: string;
          created_at?: string;
          id?: string;
          preorder_ship_date?: string | null;
          price_fils?: number;
          product_id?: string;
          size?: string;
          sku?: string;
          sort_order?: number;
          stock_mode?: Database['public']['Enums']['stock_mode'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_variants_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          care_ar: string | null;
          care_en: string | null;
          created_at: string;
          description_ar: string | null;
          description_en: string | null;
          fabric: string;
          gender: Database['public']['Enums']['product_gender'];
          id: string;
          name_ar: string | null;
          name_en: string;
          origin_country: string | null;
          slug: string;
          status: Database['public']['Enums']['product_status'];
          style_code: string;
          updated_at: string;
        };
        Insert: {
          care_ar?: string | null;
          care_en?: string | null;
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          fabric: string;
          gender: Database['public']['Enums']['product_gender'];
          id?: string;
          name_ar?: string | null;
          name_en: string;
          origin_country?: string | null;
          slug: string;
          status?: Database['public']['Enums']['product_status'];
          style_code: string;
          updated_at?: string;
        };
        Update: {
          care_ar?: string | null;
          care_en?: string | null;
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          fabric?: string;
          gender?: Database['public']['Enums']['product_gender'];
          id?: string;
          name_ar?: string | null;
          name_en?: string;
          origin_country?: string | null;
          slug?: string;
          status?: Database['public']['Enums']['product_status'];
          style_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      refunds: {
        Row: {
          amount_fils: number;
          created_at: string;
          id: string;
          order_id: string;
          payment_id: string;
          processed_at: string | null;
          provider_ref: string | null;
          reason: string;
          requested_by: string | null;
          status: Database['public']['Enums']['refund_status'];
          updated_at: string;
        };
        Insert: {
          amount_fils: number;
          created_at?: string;
          id?: string;
          order_id: string;
          payment_id: string;
          processed_at?: string | null;
          provider_ref?: string | null;
          reason: string;
          requested_by?: string | null;
          status?: Database['public']['Enums']['refund_status'];
          updated_at?: string;
        };
        Update: {
          amount_fils?: number;
          created_at?: string;
          id?: string;
          order_id?: string;
          payment_id?: string;
          processed_at?: string | null;
          provider_ref?: string | null;
          reason?: string;
          requested_by?: string | null;
          status?: Database['public']['Enums']['refund_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refunds_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
        ];
      };
      returns: {
        Row: {
          created_at: string;
          customer_id: string | null;
          id: string;
          items: Json;
          order_id: string;
          reason: string;
          rma_no: string;
          status: Database['public']['Enums']['return_status'];
          type: Database['public']['Enums']['return_type'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          items?: Json;
          order_id: string;
          reason: string;
          rma_no?: string;
          status?: Database['public']['Enums']['return_status'];
          type: Database['public']['Enums']['return_type'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          items?: Json;
          order_id?: string;
          reason?: string;
          rma_no?: string;
          status?: Database['public']['Enums']['return_status'];
          type?: Database['public']['Enums']['return_type'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'returns_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'returns_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          description: string | null;
          is_public: boolean;
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          description?: string | null;
          is_public?: boolean;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          description?: string | null;
          is_public?: boolean;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      shipments: {
        Row: {
          carrier: string | null;
          created_at: string;
          delivered_at: string | null;
          events: Json;
          id: string;
          order_id: string;
          provider: string;
          provider_order_ref: string | null;
          shipped_at: string | null;
          status: Database['public']['Enums']['shipment_status'];
          tracking_no: string | null;
          updated_at: string;
        };
        Insert: {
          carrier?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          events?: Json;
          id?: string;
          order_id: string;
          provider: string;
          provider_order_ref?: string | null;
          shipped_at?: string | null;
          status?: Database['public']['Enums']['shipment_status'];
          tracking_no?: string | null;
          updated_at?: string;
        };
        Update: {
          carrier?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          events?: Json;
          id?: string;
          order_id?: string;
          provider?: string;
          provider_order_ref?: string | null;
          shipped_at?: string | null;
          status?: Database['public']['Enums']['shipment_status'];
          tracking_no?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shipments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_members: {
        Row: {
          active: boolean;
          created_at: string;
          display_name: string;
          role: Database['public']['Enums']['staff_role'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          display_name: string;
          role: Database['public']['Enums']['staff_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          display_name?: string;
          role?: Database['public']['Enums']['staff_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      waitlist_signups: {
        Row: {
          consent_id: string | null;
          created_at: string;
          customer_id: string | null;
          drop_id: string | null;
          email: string | null;
          id: string;
          locale: string;
          phone: string | null;
          referral_code: string;
          referred_by: string | null;
          source: string;
        };
        Insert: {
          consent_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          drop_id?: string | null;
          email?: string | null;
          id?: string;
          locale?: string;
          phone?: string | null;
          referral_code?: string;
          referred_by?: string | null;
          source: string;
        };
        Update: {
          consent_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          drop_id?: string | null;
          email?: string | null;
          id?: string;
          locale?: string;
          phone?: string | null;
          referral_code?: string;
          referred_by?: string | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'waitlist_signups_consent_id_fkey';
            columns: ['consent_id'];
            isOneToOne: false;
            referencedRelation: 'consents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'waitlist_signups_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'waitlist_signups_drop_id_fkey';
            columns: ['drop_id'];
            isOneToOne: false;
            referencedRelation: 'drops';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'waitlist_signups_referred_by_fkey';
            columns: ['referred_by'];
            isOneToOne: false;
            referencedRelation: 'waitlist_signups';
            referencedColumns: ['id'];
          },
        ];
      };
      webhook_events: {
        Row: {
          attempts: number;
          error: string | null;
          event_id: string;
          event_type: string | null;
          id: number;
          payload: Json;
          processed_at: string | null;
          provider: string;
          received_at: string;
          signature_ok: boolean;
        };
        Insert: {
          attempts?: number;
          error?: string | null;
          event_id: string;
          event_type?: string | null;
          id?: never;
          payload: Json;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
          signature_ok: boolean;
        };
        Update: {
          attempts?: number;
          error?: string | null;
          event_id?: string;
          event_type?: string | null;
          id?: never;
          payload?: Json;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
          signature_ok?: boolean;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_order_transition: {
        Args: {
          p_actor_type?: string;
          p_metadata?: Json;
          p_order_id: string;
          p_reason?: string;
          p_to_status: Database['public']['Enums']['order_status'];
        };
        Returns: {
          billing_address: Json | null;
          cart_id: string | null;
          created_at: string;
          currency: string;
          customer_id: string | null;
          delivery_promise_date: string | null;
          drop_id: string | null;
          email: string;
          has_made_to_order_lines: boolean;
          id: string;
          locale: string;
          order_number: string;
          payment_method: Database['public']['Enums']['payment_provider'] | null;
          phone: string | null;
          placed_at: string;
          shipping_address: Json;
          shipping_fils: number;
          status: Database['public']['Enums']['order_status'];
          subtotal_net_fils: number;
          total_fils: number;
          updated_at: string;
          vat_fils: number;
          vat_rate_bp: number;
        };
        SetofOptions: {
          from: '*';
          to: 'orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_actor_type: { Args: never; Returns: string };
      hit_rate_limit: {
        Args: {
          p_bucket: string;
          p_key_hash: string;
          p_max: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      is_staff: {
        Args: { required_role?: Database['public']['Enums']['staff_role'] };
        Returns: boolean;
      };
      join_waitlist: {
        Args: {
          p_drop_id: string;
          p_email: string;
          p_email_consent: boolean;
          p_locale: string;
          p_phone: string;
          p_ref_code: string;
          p_source: string;
          p_whatsapp_consent: boolean;
        };
        Returns: {
          already_joined: boolean;
          queue_position: number;
          referral_code: string;
          signup_id: string;
        }[];
      };
      next_order_number: { Args: never; Returns: string };
      write_audit: {
        Args: {
          p_action: string;
          p_actor_type?: string;
          p_after?: Json;
          p_before?: Json;
          p_entity_id: string;
          p_entity_type: string;
          p_metadata?: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      cart_status: 'active' | 'converted' | 'abandoned';
      consent_channel: 'marketing_email' | 'marketing_whatsapp';
      drop_status: 'draft' | 'scheduled' | 'early_access' | 'open' | 'sold_out' | 'closed';
      inventory_location: 'warehouse' | 'studio';
      inventory_reason:
        | 'initial_count'
        | 'manual_adjustment'
        | '3pl_sync'
        | 'inbound_received'
        | 'transfer'
        | 'order_reserved'
        | 'order_released'
        | 'order_shipped'
        | 'return_restocked'
        | 'damaged';
      inventory_source: 'manual' | '3pl_sync';
      order_status:
        | 'pending_payment'
        | 'paid'
        | 'in_production'
        | 'ready_to_ship'
        | 'shipped'
        | 'delivered'
        | 'cancelled'
        | 'refunded'
        | 'partially_refunded'
        | 'exchange_requested'
        | 'exchange_in_progress'
        | 'exchange_completed';
      payment_provider: 'card' | 'tabby' | 'tamara';
      payment_status:
        | 'created'
        | 'pending'
        | 'authorized'
        | 'captured'
        | 'failed'
        | 'cancelled'
        | 'expired'
        | 'refunded'
        | 'partially_refunded';
      product_gender: 'men' | 'women' | 'unisex';
      product_status: 'draft' | 'active' | 'archived';
      refund_status: 'requested' | 'pending' | 'succeeded' | 'failed' | 'cancelled';
      return_status:
        | 'requested'
        | 'approved'
        | 'rejected'
        | 'in_transit'
        | 'received'
        | 'inspected'
        | 'completed'
        | 'cancelled';
      return_type: 'refund' | 'exchange';
      shipment_status:
        | 'pending'
        | 'created'
        | 'picked'
        | 'packed'
        | 'handed_to_carrier'
        | 'in_transit'
        | 'out_for_delivery'
        | 'delivered'
        | 'failed_delivery'
        | 'returned_to_sender'
        | 'cancelled';
      staff_role: 'owner' | 'ops';
      stock_mode: 'stock' | 'preorder' | 'mto';
      uae_emirate:
        | 'abu_dhabi'
        | 'dubai'
        | 'sharjah'
        | 'ajman'
        | 'umm_al_quwain'
        | 'ras_al_khaimah'
        | 'fujairah';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      cart_status: ['active', 'converted', 'abandoned'],
      consent_channel: ['marketing_email', 'marketing_whatsapp'],
      drop_status: ['draft', 'scheduled', 'early_access', 'open', 'sold_out', 'closed'],
      inventory_location: ['warehouse', 'studio'],
      inventory_reason: [
        'initial_count',
        'manual_adjustment',
        '3pl_sync',
        'inbound_received',
        'transfer',
        'order_reserved',
        'order_released',
        'order_shipped',
        'return_restocked',
        'damaged',
      ],
      inventory_source: ['manual', '3pl_sync'],
      order_status: [
        'pending_payment',
        'paid',
        'in_production',
        'ready_to_ship',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
        'partially_refunded',
        'exchange_requested',
        'exchange_in_progress',
        'exchange_completed',
      ],
      payment_provider: ['card', 'tabby', 'tamara'],
      payment_status: [
        'created',
        'pending',
        'authorized',
        'captured',
        'failed',
        'cancelled',
        'expired',
        'refunded',
        'partially_refunded',
      ],
      product_gender: ['men', 'women', 'unisex'],
      product_status: ['draft', 'active', 'archived'],
      refund_status: ['requested', 'pending', 'succeeded', 'failed', 'cancelled'],
      return_status: [
        'requested',
        'approved',
        'rejected',
        'in_transit',
        'received',
        'inspected',
        'completed',
        'cancelled',
      ],
      return_type: ['refund', 'exchange'],
      shipment_status: [
        'pending',
        'created',
        'picked',
        'packed',
        'handed_to_carrier',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'failed_delivery',
        'returned_to_sender',
        'cancelled',
      ],
      staff_role: ['owner', 'ops'],
      stock_mode: ['stock', 'preorder', 'mto'],
      uae_emirate: [
        'abu_dhabi',
        'dubai',
        'sharjah',
        'ajman',
        'umm_al_quwain',
        'ras_al_khaimah',
        'fujairah',
      ],
    },
  },
} as const;
