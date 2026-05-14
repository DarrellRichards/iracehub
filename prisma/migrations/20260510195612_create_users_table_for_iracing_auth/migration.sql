-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "iracing_cust_id" TEXT NOT NULL,
    "display_name" TEXT,
    "country" TEXT,
    "member_since" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_iracing_cust_id_key" ON "users"("iracing_cust_id");
