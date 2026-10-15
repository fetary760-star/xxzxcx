-- This SQL script sets up the database schema for the Advanced Task Management System for SQL Server
-- Based on the SQLite schema but adapted for SQL Server syntax and data types

-- Drop tables in reverse order of foreign key dependencies to avoid errors
IF OBJECT_ID('task_transfers', 'U') IS NOT NULL DROP TABLE task_transfers;
IF OBJECT_ID('task_comments', 'U') IS NOT NULL DROP TABLE task_comments;
IF OBJECT_ID('performance_metrics', 'U') IS NOT NULL DROP TABLE performance_metrics;
IF OBJECT_ID('notifications', 'U') IS NOT NULL DROP TABLE notifications;
IF OBJECT_ID('task_attachments', 'U') IS NOT NULL DROP TABLE task_attachments;
IF OBJECT_ID('tasks', 'U') IS NOT NULL DROP TABLE tasks;
IF OBJECT_ID('task_category_target_days', 'U') IS NOT NULL DROP TABLE task_category_target_days;
IF OBJECT_ID('task_sub_types', 'U') IS NOT NULL DROP TABLE task_sub_types;
IF OBJECT_ID('task_priority_levels', 'U') IS NOT NULL DROP TABLE task_priority_levels;
IF OBJECT_ID('request_types', 'U') IS NOT NULL DROP TABLE request_types;
IF OBJECT_ID('task_categories', 'U') IS NOT NULL DROP TABLE task_categories;
IF OBJECT_ID('employee_schedules', 'U') IS NOT NULL DROP TABLE employee_schedules;
IF OBJECT_ID('employee_leaves', 'U') IS NOT NULL DROP TABLE employee_leaves;
IF OBJECT_ID('audit_trail', 'U') IS NOT NULL DROP TABLE audit_trail;
IF OBJECT_ID('holidays', 'U') IS NOT NULL DROP TABLE holidays;
IF OBJECT_ID('shops', 'U') IS NOT NULL DROP TABLE shops;
IF OBJECT_ID('users', 'U') IS NOT NULL DROP TABLE users;

-- Create shops table
CREATE TABLE shops (
    shop_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) UNIQUE NOT NULL,
    description NVARCHAR(MAX) NULL,
    team_leader_id INT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by NVARCHAR(100) NULL,
    registered_by NVARCHAR(100) NULL,
    registered_date DATETIME2 DEFAULT GETUTCDATE(),
    start_date DATETIME2 NULL,
    end_date DATETIME2 NULL,
    timezone_info NVARCHAR(100) NULL,
    last_update_date DATETIME2 NULL,
    record_status NVARCHAR(20) DEFAULT 'Active',
    is_readonly BIT DEFAULT 0
);

-- Create users table
CREATE TABLE users (
    user_id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) UNIQUE NOT NULL,
    password NVARCHAR(255) NOT NULL,
    email NVARCHAR(100) UNIQUE NOT NULL,
    full_name NVARCHAR(100) NOT NULL,
    role NVARCHAR(50) CHECK (role IN ('team_leader', 'director', 'engineer', 'customer_personnel', 'customer', 'shop_tl')) NOT NULL,
    status NVARCHAR(20) CHECK (status IN ('Active', 'Inactive', 'Suspended')) DEFAULT 'Active',
    profile_picture_path NVARCHAR(255) NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by NVARCHAR(100) NULL,
    supervisor_id INT NULL,
    shop_id INT NULL,
    password_reset_token NVARCHAR(255) NULL,
    password_reset_expires_at DATETIME2 NULL,
    registered_by NVARCHAR(100) NULL,
    registered_date DATETIME2 DEFAULT GETUTCDATE(),
    start_date DATETIME2 NULL,
    end_date DATETIME2 NULL,
    timezone_info NVARCHAR(100) NULL,
    last_update_date DATETIME2 NULL,
    record_status NVARCHAR(20) DEFAULT 'Active',
    is_readonly BIT DEFAULT 0,
    FOREIGN KEY (supervisor_id) REFERENCES users(user_id),
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
);

-- Add foreign key constraint for shops.team_leader_id after users table is created
ALTER TABLE shops ADD CONSTRAINT FK_shops_team_leader FOREIGN KEY (team_leader_id) REFERENCES users(user_id);

-- Create task_categories table
CREATE TABLE task_categories (
    category_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) UNIQUE NOT NULL,
    description NVARCHAR(MAX) NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by NVARCHAR(100) NULL,
    registered_by NVARCHAR(100) NULL,
    registered_date DATETIME2 DEFAULT GETUTCDATE(),
    start_date DATETIME2 NULL,
    end_date DATETIME2 NULL,
    timezone_info NVARCHAR(100) NULL,
    last_update_date DATETIME2 NULL,
    record_status NVARCHAR(20) DEFAULT 'Active',
    is_readonly BIT DEFAULT 0
);

-- Create task_category_target_days table
CREATE TABLE task_category_target_days (
    target_id INT IDENTITY(1,1) PRIMARY KEY,
    category_id INT NOT NULL UNIQUE,
    target_days INT NOT NULL DEFAULT 5,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (category_id) REFERENCES task_categories(category_id) ON DELETE CASCADE
);

-- Create task_sub_types table
CREATE TABLE task_sub_types (
    sub_type_id INT IDENTITY(1,1) PRIMARY KEY,
    category_id INT NOT NULL,
    name NVARCHAR(100) NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by NVARCHAR(100) NULL,
    registered_by NVARCHAR(100) NULL,
    registered_date DATETIME2 DEFAULT GETUTCDATE(),
    start_date DATETIME2 NULL,
    end_date DATETIME2 NULL,
    timezone_info NVARCHAR(100) NULL,
    last_update_date DATETIME2 NULL,
    record_status NVARCHAR(20) DEFAULT 'Active',
    is_readonly BIT DEFAULT 0,
    CONSTRAINT UC_SubType_Category UNIQUE (category_id, name),
    FOREIGN KEY (category_id) REFERENCES task_categories(category_id) ON DELETE CASCADE
);

-- Create request_types table
CREATE TABLE request_types (
    request_type_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) UNIQUE NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by NVARCHAR(100) NULL,
    registered_by NVARCHAR(100) NULL,
    registered_date DATETIME2 DEFAULT GETUTCDATE(),
    start_date DATETIME2 NULL,
    end_date DATETIME2 NULL,
    timezone_info NVARCHAR(100) NULL,
    last_update_date DATETIME2 NULL,
    record_status NVARCHAR(20) DEFAULT 'Active',
    is_readonly BIT DEFAULT 0
);

-- Create task_priority_levels table
CREATE TABLE task_priority_levels (
    priority_id INT IDENTITY(1,1) PRIMARY KEY,
    level_name NVARCHAR(50) UNIQUE NOT NULL,
    order_rank INT UNIQUE NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by NVARCHAR(100) NULL,
    registered_by NVARCHAR(100) NULL,
    registered_date DATETIME2 DEFAULT GETUTCDATE(),
    start_date DATETIME2 NULL,
    end_date DATETIME2 NULL,
    timezone_info NVARCHAR(100) NULL,
    last_update_date DATETIME2 NULL,
    record_status NVARCHAR(20) DEFAULT 'Active',
    is_readonly BIT DEFAULT 0
);

-- Create tasks table
CREATE TABLE tasks (
    task_id INT IDENTITY(1,1) PRIMARY KEY,
    serial_number NVARCHAR(100) NULL,
    part_number NVARCHAR(100) NULL,
    po_number NVARCHAR(100) NULL,
    description NVARCHAR(MAX) NOT NULL,
    category_id INT NOT NULL,
    sub_type_id INT NULL,
    request_type_id INT NULL,
    status NVARCHAR(20) CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Blocked', 'On Hold', 'Cancelled')) DEFAULT 'Pending',
    comments NVARCHAR(MAX) NULL,
    assigned_engineer NVARCHAR(255) DEFAULT 'Unassigned',
    priority_id INT NOT NULL,
    estimated_completion_date DATE NOT NULL,
    target_completion_date DATE NULL,
    actual_completion_date DATE NULL,
    attachment_path NVARCHAR(255) NULL,
    amendment_request BIT DEFAULT 0,
    amendment_status NVARCHAR(50) CHECK (amendment_status IN ('Pending TL Review', 'Forwarded to Director', 'Approved', 'Rejected')) DEFAULT NULL,
    amendment_reviewed_by_tl_id INT NULL,
    is_duplicate BIT DEFAULT 0,
    duplicate_justification NVARCHAR(MAX) NULL,
    revision_notes NVARCHAR(MAX) NULL,
    show_revision_alert BIT DEFAULT 0,
    supervisor_id INT NULL,
    shop_id INT NULL,
    created_by INT NOT NULL, -- This FK was causing issues
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    cancelled_by INT NULL,
    cancellation_reason NVARCHAR(MAX) NULL,
    cancelled_at DATETIME2 NULL,
    is_mandatory BIT DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES task_categories(category_id) ON DELETE CASCADE,
    FOREIGN KEY (sub_type_id) REFERENCES task_sub_types(sub_type_id),
    FOREIGN KEY (request_type_id) REFERENCES request_types(request_type_id),
    FOREIGN KEY (priority_id) REFERENCES task_priority_levels(priority_id) ON DELETE CASCADE,
    -- MODIFICATION: Changed ON DELETE CASCADE to ON DELETE NO ACTION (default) to break the cycle.
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    FOREIGN KEY (amendment_reviewed_by_tl_id) REFERENCES users(user_id),
    FOREIGN KEY (supervisor_id) REFERENCES users(user_id),
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id),
    FOREIGN KEY (cancelled_by) REFERENCES users(user_id)
);

-- Create task_attachments table
CREATE TABLE task_attachments (
    attachment_id INT IDENTITY(1,1) PRIMARY KEY,
    task_id INT NOT NULL,
    file_path NVARCHAR(255) NOT NULL,
    file_name NVARCHAR(255) NOT NULL,
    file_type NVARCHAR(100) NULL,
    uploaded_by INT NULL,
    uploaded_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);

-- Create task_comments table
CREATE TABLE task_comments (
    comment_id INT IDENTITY(1,1) PRIMARY KEY,
    task_id INT NOT NULL,
    user_id INT NOT NULL, -- This FK was causing issues (Line 216 in the original file)
    comment_text NVARCHAR(MAX) NOT NULL,
    is_intervention BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    -- MODIFICATION: Changed ON DELETE CASCADE to ON DELETE NO ACTION (default) to break the cycle.
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Create notifications table
CREATE TABLE notifications (
    notification_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    is_read BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create performance_metrics table
CREATE TABLE performance_metrics (
    user_id INT PRIMARY KEY,
    completion_rate DECIMAL(5,2) DEFAULT 0.00,
    avg_delay_days DECIMAL(5,2) DEFAULT 0.00,
    tasks_completed INT DEFAULT 0,
    pending_tasks_count INT DEFAULT 0,
    last_updated DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create employee_schedules table
CREATE TABLE employee_schedules (
    schedule_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    schedule_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    shift_type NVARCHAR(50) NULL,
    comments NVARCHAR(MAX) NULL,
    status NVARCHAR(20) CHECK (status IN ('Draft', 'Approved', 'Locked')) DEFAULT 'Draft',
    approved_by INT NULL,
    approval_date DATETIME2 NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(user_id),
    CONSTRAINT UC_User_Schedule_Date UNIQUE (user_id, schedule_date)
);

-- Create employee_leaves table
CREATE TABLE employee_leaves (
    leave_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    leave_type NVARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason NVARCHAR(MAX) NULL,
    status NVARCHAR(20) CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')) DEFAULT 'Pending',
    approved_by INT NULL,
    approval_date DATETIME2 NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(user_id)
);

-- Create audit_trail table
CREATE TABLE audit_trail (
    audit_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NULL,
    action_type NVARCHAR(50) NOT NULL,
    entity_type NVARCHAR(50) NOT NULL,
    entity_id INT NULL,
    old_value NVARCHAR(MAX) NULL,
    new_value NVARCHAR(MAX) NULL,
    change_details NVARCHAR(MAX) NULL,
    timestamp DATETIME2 DEFAULT GETUTCDATE()
);

-- Create holidays table
CREATE TABLE holidays (
    holiday_id INT IDENTITY(1,1) PRIMARY KEY,
    holiday_date DATE UNIQUE NOT NULL,
    name NVARCHAR(100) NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE()
);

-- Create task_transfers table
CREATE TABLE task_transfers (
    transfer_id INT IDENTITY(1,1) PRIMARY KEY,
    task_id INT NOT NULL,
    from_shop_id INT NOT NULL,
    to_shop_id INT NOT NULL,
    transferred_by_user_id INT NOT NULL,
    status NVARCHAR(20) CHECK (status IN ('Pending', 'Accepted', 'Rejected', 'Cancelled')) DEFAULT 'Pending',
    comments NVARCHAR(MAX) NULL,
    action_by_user_id INT NULL,
    action_at DATETIME2 NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY (from_shop_id) REFERENCES shops(shop_id),
    FOREIGN KEY (to_shop_id) REFERENCES shops(shop_id),
    FOREIGN KEY (transferred_by_user_id) REFERENCES users(user_id),
    FOREIGN KEY (action_by_user_id) REFERENCES users(user_id)
);

-- Insert sample shops
INSERT INTO shops (name, description, registered_by) VALUES
('Machine Shop', 'Handles all machining tasks.', 'System'),
('Paint Shop', 'Handles all painting tasks.', 'System'),
('Welding Shop', 'Handles all welding tasks.', 'System'),
('Fuel Shop', 'Handles fuel system components.', 'System'),
('Break Shop', 'Handles brake and landing gear systems.', 'System'),
('Emergency Shop', 'Handles emergency equipment.', 'System');

-- Insert base users with BCrypt hashed passwords (password: cmt@1234567)
INSERT INTO users (username, password, email, full_name, role, profile_picture_path) VALUES
('team_leader', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'teamleader@example.com', 'Team Leader One', 'team_leader', NULL),
('director', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'director@example.com', 'Director Alpha', 'director', NULL),
('john.doe', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'john.doe@example.com', 'John Doe', 'engineer', NULL),
('sarah.smith', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'sarah.smith@example.com', 'Sarah Smith', 'engineer', NULL),
('mike.johnson', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'mike.johnson@example.com', 'Mike Johnson', 'engineer', NULL),
('emma.wilson', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'emma.wilson@example.com', 'Emma Wilson', 'engineer', NULL),
('customer.personnel', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'customer.personnel@example.com', 'Cust. Personnel One', 'customer_personnel', NULL),
('customer.user', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'customer@example.com', 'Customer User', 'customer', NULL);

-- Insert Shop Team Leaders
INSERT INTO users (username, password, email, full_name, role, shop_id) VALUES
('fuel_shop_tl', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'fuel.tl@example.com', 'Fuel Shop TL', 'shop_tl', (SELECT shop_id FROM shops WHERE name = 'Fuel Shop')),
('break_shop_tl', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'break.tl@example.com', 'Break Shop TL', 'shop_tl', (SELECT shop_id FROM shops WHERE name = 'Break Shop')),
('emergency_shop_tl', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'emergency.tl@example.com', 'Emergency Shop TL', 'shop_tl', (SELECT shop_id FROM shops WHERE name = 'Emergency Shop'));

-- Insert Customer Personnel under Shop TLs
INSERT INTO users (username, password, email, full_name, role, supervisor_id, shop_id) VALUES
('fuel_tech_1', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'fuel.tech1@example.com', 'Fuel Tech One', 'customer_personnel', (SELECT user_id FROM users WHERE username = 'fuel_shop_tl'), (SELECT shop_id FROM shops WHERE name = 'Fuel Shop')),
('fuel_tech_2', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'fuel.tech2@example.com', 'Fuel Tech Two', 'customer_personnel', (SELECT user_id FROM users WHERE username = 'fuel_shop_tl'), (SELECT shop_id FROM shops WHERE name = 'Fuel Shop')),
('break_tech_1', '$2a$20$kgy3hJW5iOwgKR82jzGx9.o2laPoyxe.k76YkLiveqYwMgQNjaflO', 'break.tech1@example.com', 'Break Tech One', 'customer_personnel', (SELECT user_id FROM users WHERE username = 'break_shop_tl'), (SELECT shop_id FROM shops WHERE name = 'Break Shop'));

-- Populate default task categories
INSERT INTO task_categories (name, description, registered_by) VALUES
('AOG & CSD Components Evaluation', 'Aircraft on Ground (AOG) and Critical Spares Demand (CSD) component evaluations.', 'System'),
('Task Card Related', 'Tasks related to creating, revising, or approving task cards.', 'System'),
('Scrap Evaluation & Approval', 'Evaluation and approval process for parts marked for scrap.', 'System'),
('Tool & Equivalency', 'Tasks related to tool design, procurement, and equivalency assessments.', 'System'),
('Repair Cost Approval', 'Approval process for repair costs exceeding a certain threshold.', 'System'),
('Special Assignment', 'Miscellaneous special projects or assignments.', 'System'),
('Maintenance', 'General aircraft maintenance tasks.', 'System'),
('Compliance & Audit', 'Tasks related to regulatory compliance and internal audits.', 'System');

-- Populate default task sub types
INSERT INTO task_sub_types (category_id, name, registered_by) VALUES
((SELECT category_id FROM task_categories WHERE name = 'AOG & CSD Components Evaluation'), 'Component Inspection', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'AOG & CSD Components Evaluation'), 'Repair Assessment', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Task Card Related'), 'Card Creation', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Task Card Related'), 'Card Revision', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Task Card Related'), 'Card Approval', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Scrap Evaluation & Approval'), 'Material Disposal', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Scrap Evaluation & Approval'), 'Salvageable Parts', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Tool & Equivalency'), 'Tool Design', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Tool & Equivalency'), 'Tool Procurement', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Tool & Equivalency'), 'Equivalency Study', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Repair Cost Approval'), 'Quotation Review', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Repair Cost Approval'), 'Budget Approval', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Special Assignment'), 'Software Integration', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Special Assignment'), 'Process Improvement', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Maintenance'), 'Engine Overhaul', 'System'),
((SELECT category_id FROM task_categories WHERE name = 'Maintenance'), 'Avionics Repair', 'System');

-- Populate default request types
INSERT INTO request_types (name, registered_by) VALUES
('New Task Request', 'System'),
('Change Request', 'System'),
('Information Request', 'System'),
('Approval Request', 'System'),
('Urgent Request', 'System'),
('Routine Request', 'System');

-- Populate default task priority levels
INSERT INTO task_priority_levels (level_name, order_rank, registered_by) VALUES
('Critical', 0, 'System'),
('High', 1, 'System'),
('Medium', 2, 'System'),
('Low', 3, 'System');

-- Populate default task category target days
INSERT INTO task_category_target_days (category_id, target_days) VALUES
((SELECT category_id FROM task_categories WHERE name = 'AOG & CSD Components Evaluation'), 7),
((SELECT category_id FROM task_categories WHERE name = 'Task Card Related'), 10),
((SELECT category_id FROM task_categories WHERE name = 'Scrap Evaluation & Approval'), 5),
((SELECT category_id FROM task_categories WHERE name = 'Tool & Equivalency'), 15),
((SELECT category_id FROM task_categories WHERE name = 'Repair Cost Approval'), 3),
((SELECT category_id FROM task_categories WHERE name = 'Special Assignment'), 20),
((SELECT category_id FROM task_categories WHERE name = 'Maintenance'), 14),
((SELECT category_id FROM task_categories WHERE name = 'Compliance & Audit'), 30);

-- Populate some sample tasks
INSERT INTO tasks (
    serial_number, part_number, po_number, description,
    category_id, sub_type_id, request_type_id, status, comments, assigned_engineer, priority_id,
    estimated_completion_date, target_completion_date, actual_completion_date, created_by
) VALUES
(
    'SN001', 'PN12345', 'PO-98765', 'Investigate fault in engine XYZ due to recurrent vibration. Urgent fix required for AOG.',
    (SELECT category_id FROM task_categories WHERE name = 'AOG & CSD Components Evaluation'),
    (SELECT sub_type_id FROM task_sub_types WHERE name = 'Component Inspection'),
    (SELECT request_type_id FROM request_types WHERE name = 'Urgent Request'),
    'In Progress', 'Initial assessment complete. Awaiting specific diagnostic tools.', 'John Doe',
    (SELECT priority_id FROM task_priority_levels WHERE level_name = 'Critical'),
    '2025-06-25', '2025-06-20', NULL,
    (SELECT user_id FROM users WHERE username = 'customer.personnel')
),
(
    'SN002', 'PN67890', NULL, 'Review and approve new task card for flap actuator replacement.',
    (SELECT category_id FROM task_categories WHERE name = 'Task Card Related'),
    (SELECT sub_type_id FROM task_sub_types WHERE name = 'Card Approval'),
    (SELECT request_type_id FROM request_types WHERE name = 'Approval Request'),
    'Pending', 'Needs Director signature by end of week.', 'Team Leader One',
    (SELECT priority_id FROM task_priority_levels WHERE level_name = 'High'),
    '2025-06-30', '2025-06-28', NULL,
    (SELECT user_id FROM users WHERE username = 'director')
),
(
    'SN003', 'PN11223', 'PO-54321', 'Evaluate scrap metal from old landing gear for disposal process.',
    (SELECT category_id FROM task_categories WHERE name = 'Scrap Evaluation & Approval'),
    (SELECT sub_type_id FROM task_sub_types WHERE name = 'Material Disposal'),
    (SELECT request_type_id FROM request_types WHERE name = 'Routine Request'),
    'Completed', 'Disposal completed and documented on 2025-06-15.', 'Sarah Smith',
    (SELECT priority_id FROM task_priority_levels WHERE level_name = 'Medium'),
    '2025-06-18', '2025-06-17', '2025-06-15',
    (SELECT user_id FROM users WHERE username = 'john.doe')
);

-- Populate default holidays
INSERT INTO holidays (holiday_date, name) VALUES
('2025-01-01', 'New Year''s Day'),
('2025-01-07', 'Ethiopian Christmas (Genna)'),
('2025-01-19', 'Epiphany (Timkat)'),
('2025-03-02', 'Victory of Adwa'),
('2025-04-18', 'Good Friday'),
('2025-04-20', 'Ethiopian Easter (Fasika)'),
('2025-05-01', 'International Labor Day'),
('2025-05-05', 'Ethiopian Patriots'' Victory Day'),
('2025-05-28', 'Downfall of the Derg Regime'),
('2025-09-11', 'Ethiopian New Year (Enkutatash)'),
('2025-09-27', 'Finding of the True Cross (Meskel)');
