// Script to set password for josephvaleri@gmail.com
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function setPassword() {
  console.log('🔐 Setting password for josephvaleri@gmail.com...');
  
  try {
    // Create Supabase client with service role key
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    const email = 'josephvaleri@gmail.com';
    const newPassword = 'M0nt3F@lc0!';
    
    // First, check if the user exists
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }
    
    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.log('❌ User not found. Creating new user...');
      
      // Create the user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: newPassword,
        email_confirm: true
      });
      
      if (createError) {
        throw new Error(`Failed to create user: ${createError.message}`);
      }
      
      console.log('✅ User created successfully!');
      console.log(`   User ID: ${newUser.user.id}`);
      console.log(`   Email: ${newUser.user.email}`);
      
    } else {
      console.log('✅ User found. Updating password...');
      console.log(`   User ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      
      // Update the user's password
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
      );
      
      if (updateError) {
        throw new Error(`Failed to update password: ${updateError.message}`);
      }
      
      console.log('✅ Password updated successfully!');
    }
    
    console.log('\n🎉 Password set successfully!');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    console.log('\nYou can now log in with these credentials.');
    
  } catch (error) {
    console.error('❌ Error setting password:', error.message);
    process.exit(1);
  }
}

setPassword();
