-- ============================================
-- NEXUS - Full Database Schema (Updated)
-- Admin Panel + Customer Portal
-- ============================================

CREATE DATABASE IF NOT EXISTS nexus_db;
USE nexus_db;

-- ============================================
-- CORE TABLES
-- ============================================

-- Users (admin panel employees)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'support', 'warehouse', 'marketing') DEFAULT 'support',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers (with portal login support)
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  password VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  quantity INT DEFAULT 0,
  low_stock_threshold INT DEFAULT 10,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INT NOT NULL,
  status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
  total DECIMAL(10,2) NOT NULL,
  shipping_address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Returns
CREATE TABLE IF NOT EXISTS returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  customer_id INT NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
  refund_amount DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  assigned_to INT,
  created_by INT NOT NULL,
  status ENUM('todo', 'in_progress', 'done') DEFAULT 'todo',
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  due_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================
-- ADMIN AI TABLES
-- ============================================

-- AI Conversations (admin panel)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) DEFAULT 'New Conversation',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- AI Messages (admin panel)
CREATE TABLE IF NOT EXISTS ai_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

-- ============================================
-- CUSTOMER PORTAL TABLES
-- ============================================

-- Wishlist
CREATE TABLE IF NOT EXISTS wishlists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_wishlist_item (customer_id, product_id)
);

-- Cart
CREATE TABLE IF NOT EXISTS cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_cart_item (customer_id, product_id)
);

-- Customer AI Conversations (shopping advisor)
CREATE TABLE IF NOT EXISTS customer_ai_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Customer AI Messages (shopping advisor)
CREATE TABLE IF NOT EXISTS customer_ai_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES customer_ai_conversations(id) ON DELETE CASCADE
);

-- ============================================
-- SAMPLE DATA
-- ============================================

-- Admin users (password: admin123)
INSERT INTO users (name, email, password, role) VALUES
('Admin User',     'admin@nexus.com', '$2a$10$jTcG9bGknS6dsNexHRoyDOjU5V7I6AYiz3BniXQ7M2hCj/uBkQaiC', 'admin'),
('Sarah Johnson',  'sarah@nexus.com', '$2a$10$jTcG9bGknS6dsNexHRoyDOjU5V7I6AYiz3BniXQ7M2hCj/uBkQaiC', 'manager'),
('Mike Chen',      'mike@nexus.com',  '$2a$10$jTcG9bGknS6dsNexHRoyDOjU5V7I6AYiz3BniXQ7M2hCj/uBkQaiC', 'support'),
('Emma Davis',     'emma@nexus.com',  '$2a$10$jTcG9bGknS6dsNexHRoyDOjU5V7I6AYiz3BniXQ7M2hCj/uBkQaiC', 'warehouse'),
('James Wilson',   'james@nexus.com', '$2a$10$jTcG9bGknS6dsNexHRoyDOjU5V7I6AYiz3BniXQ7M2hCj/uBkQaiC', 'marketing');

-- Customers (no password — they register via the customer portal)
INSERT INTO customers (name, email, phone, address) VALUES
('Alice Brown',    'alice@email.com', '+1-555-0101', '123 Main St, New York, NY 10001'),
('Bob Smith',      'bob@email.com',   '+1-555-0102', '456 Oak Ave, Los Angeles, CA 90001'),
('Carol White',    'carol@email.com', '+1-555-0103', '789 Pine Rd, Chicago, IL 60601'),
('David Lee',      'david@email.com', '+1-555-0104', '321 Elm St, Houston, TX 77001'),
('Eva Martinez',   'eva@email.com',   '+1-555-0105', '654 Maple Dr, Phoenix, AZ 85001'),
('Frank Taylor',   'frank@email.com', '+1-555-0106', '987 Cedar Ln, Philadelphia, PA 19101'),
('Grace Anderson', 'grace@email.com', '+1-555-0107', '147 Birch Blvd, San Antonio, TX 78201'),
('Henry Jackson',  'henry@email.com', '+1-555-0108', '258 Walnut St, San Diego, CA 92101');

-- Products
INSERT INTO products (name, sku, description, price, category) VALUES
('Wireless Noise-Cancelling Headphones', 'TECH-001', 'Premium wireless headphones with active noise cancellation, 30h battery life, and comfortable over-ear design.', 199.99, 'Electronics'),
('Smart Watch Series 5',                 'TECH-002', 'Advanced smartwatch with health tracking, GPS, heart rate monitor, and 5-day battery life.', 299.99, 'Electronics'),
('Ergonomic Office Chair',               'FURN-001', 'Comfortable ergonomic chair with lumbar support, adjustable armrests, and breathable mesh back.', 449.99, 'Furniture'),
('Mechanical Keyboard',                  'TECH-003', 'Full-size RGB mechanical keyboard with tactile switches, N-key rollover, and USB-C connection.', 129.99, 'Electronics'),
('Yoga Mat Premium',                     'SPORT-001', 'Non-slip premium yoga mat with alignment lines, 6mm thickness, and carry strap included.', 49.99, 'Sports'),
('Coffee Maker Pro',                     'HOME-001', 'Programmable 12-cup coffee maker with built-in grinder, thermal carafe, and auto-clean feature.', 159.99, 'Home & Kitchen'),
('Running Shoes X1',                     'SPORT-002', 'Lightweight running shoes with responsive cushioning, breathable upper, and durable rubber sole.', 89.99, 'Sports'),
('Laptop Stand Adjustable',              'TECH-004', 'Adjustable aluminum laptop stand with 6 height levels, cable management, and foldable design.', 59.99, 'Electronics'),
('Bluetooth Speaker Portable',           'TECH-005', 'IPX7 waterproof portable speaker with 360° sound, 24h battery, and built-in microphone.', 79.99, 'Electronics'),
('Desk Organizer Set',                   'FURN-002', 'Bamboo desk organizer with pen holder, phone stand, and multiple compartment trays.', 34.99, 'Furniture');

-- Inventory
INSERT INTO inventory (product_id, quantity, low_stock_threshold) VALUES
(1, 45, 10), (2, 23, 5), (3, 8, 5), (4, 67, 15),
(5, 3, 10),  (6, 31, 8), (7, 54, 20), (8, 12, 10),
(9, 89, 25), (10, 6, 10);

-- Orders
INSERT INTO orders (order_number, customer_id, status, total, shipping_address, created_at) VALUES
('ORD-2024-001', 1, 'delivered',  299.98, '123 Main St, New York, NY 10001',        DATE_SUB(NOW(), INTERVAL 15 DAY)),
('ORD-2024-002', 2, 'shipped',    449.99, '456 Oak Ave, Los Angeles, CA 90001',     DATE_SUB(NOW(), INTERVAL 10 DAY)),
('ORD-2024-003', 3, 'processing', 179.98, '789 Pine Rd, Chicago, IL 60601',         DATE_SUB(NOW(), INTERVAL 5 DAY)),
('ORD-2024-004', 4, 'pending',    299.99, '321 Elm St, Houston, TX 77001',          DATE_SUB(NOW(), INTERVAL 2 DAY)),
('ORD-2024-005', 5, 'delivered',   89.99, '654 Maple Dr, Phoenix, AZ 85001',        DATE_SUB(NOW(), INTERVAL 20 DAY)),
('ORD-2024-006', 6, 'cancelled',  129.99, '987 Cedar Ln, Philadelphia, PA 19101',   DATE_SUB(NOW(), INTERVAL 8 DAY)),
('ORD-2024-007', 7, 'shipped',    239.98, '147 Birch Blvd, San Antonio, TX 78201',  DATE_SUB(NOW(), INTERVAL 3 DAY)),
('ORD-2024-008', 8, 'pending',    159.99, '258 Walnut St, San Diego, CA 92101',     DATE_SUB(NOW(), INTERVAL 1 DAY));

-- Order Items
INSERT INTO order_items (order_id, product_id, quantity, price) VALUES
(1, 1, 1, 199.99), (1, 5, 2, 49.99),
(2, 3, 1, 449.99),
(3, 4, 1, 129.99), (3, 5, 1, 49.99),
(4, 2, 1, 299.99),
(5, 7, 1, 89.99),
(6, 4, 1, 129.99),
(7, 1, 1, 199.99), (7, 10, 1, 34.99),
(8, 6, 1, 159.99);

-- Returns
INSERT INTO returns (order_id, customer_id, reason, status, refund_amount) VALUES
(1, 1, 'Product not as described - color is different from photos', 'approved', 199.99),
(5, 5, 'Defective item - does not turn on after charging',          'pending',  89.99),
(6, 6, 'Changed mind - ordered wrong size',                         'completed', 129.99);

-- Tasks
INSERT INTO tasks (title, description, assigned_to, created_by, status, priority, due_date) VALUES
('Update product descriptions for Electronics', 'Use AI to generate better SEO-optimized descriptions for all electronics products', 5, 1, 'todo',        'high',   DATE_ADD(CURDATE(), INTERVAL 3 DAY)),
('Process pending return requests',             'Review and process the open return requests in the system',                        3, 2, 'in_progress', 'urgent', CURDATE()),
('Restock low inventory items',                 'Order more Yoga Mats (qty: 50) and Desk Organizers (qty: 30)',                    4, 1, 'todo',        'high',   DATE_ADD(CURDATE(), INTERVAL 2 DAY)),
('Create Spring Sale promotional email',        'Design and send promotional email campaign to all customers',                     5, 2, 'todo',        'medium', DATE_ADD(CURDATE(), INTERVAL 7 DAY)),
('Review Q1 sales performance report',          'Analyze Q1 performance metrics and prepare executive summary',                    2, 1, 'in_progress', 'medium', DATE_ADD(CURDATE(), INTERVAL 5 DAY));
