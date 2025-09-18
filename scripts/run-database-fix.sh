#!/bin/bash

echo "🔧 MLMP Database Schema Fix"
echo "=========================="
echo ""
echo "This script will fix the database schema for the MLMP learning system."
echo ""
echo "Please follow these steps:"
echo ""
echo "1. Go to your Supabase project dashboard"
echo "2. Navigate to the SQL Editor"
echo "3. Copy and paste the contents of 'final-database-fix.sql'"
echo "4. Run the SQL script"
echo ""
echo "The SQL file is located at:"
echo "$(pwd)/scripts/final-database-fix.sql"
echo ""
echo "After running the SQL script, the learning system should work properly!"
echo ""
echo "Press Enter to open the SQL file..."
read

# Open the SQL file in the default editor
if command -v code &> /dev/null; then
    code scripts/final-database-fix.sql
elif command -v nano &> /dev/null; then
    nano scripts/final-database-fix.sql
else
    cat scripts/final-database-fix.sql
fi
