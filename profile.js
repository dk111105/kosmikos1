document.addEventListener("DOMContentLoaded", function() {
    const editProfileBtn = document.getElementById("edit-profile-btn");
    const saveProfileBtn = document.getElementById("save-profile-btn");
    const profilePicUpload = document.getElementById("profile-pic-upload");
    const profileImg = document.getElementById("profile-img");
    const displayProfileImg = document.getElementById("display-profile-img");
    const displayUserName = document.getElementById("display-user-name");
    const displayBio = document.getElementById("display-bio");
    const userNameInput = document.getElementById("user-name");
    const bioInput = document.getElementById("bio");

    // Fetch and display profile data
    fetch('/profile-data')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error(data.error);
            } else {
                // Populate the profile display fields with the fetched data
                displayUserName.innerText = data.user_name || "User Name";
                displayBio.innerText = data.bio || "No bio added.";
                displayProfileImg.src = data.profile_picture || "images/default-profile.jpg";
            }
        })
        .catch(err => console.error('Error fetching profile data:', err));

    // Event Listener for Edit Button
    editProfileBtn.addEventListener("click", function() {
        // Switch to edit mode
        document.getElementById("profile-display").classList.add("hidden");
        document.getElementById("profile-edit").classList.remove("hidden");

        // Pre-fill the fields with the current profile data
        userNameInput.value = displayUserName.innerText;
        bioInput.value = displayBio.innerText || "";
    });

    // Event Listener for Profile Picture Upload
    profilePicUpload.addEventListener("change", function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                profileImg.src = event.target.result; // Show uploaded image as preview
            };
            reader.readAsDataURL(file);
        }
    });

    // Event Listener for Save Profile Button
    saveProfileBtn.addEventListener("click", async function() {
        const updatedUser = {
            user_name: userNameInput.value.trim(),
            bio: bioInput.value.trim(),
        };

        // Prepare FormData to send to the server
        const formData = new FormData();
        formData.append("user_name", updatedUser.user_name);
        formData.append("bio", updatedUser.bio);

        // If a new profile picture is uploaded, append it
        if (profilePicUpload.files.length > 0) {
            formData.append("profile_pic", profilePicUpload.files[0]);
        }

        try {
            const response = await fetch('/update-profile', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                // Update the displayed profile data with the newly updated info
                displayUserName.innerText = updatedUser.user_name;
                displayBio.innerText = updatedUser.bio || "No bio added.";
                if (result.profilePicPath) {
                    displayProfileImg.src = result.profilePicPath; // If the profile picture was updated, use the new path
                }

                // Switch back to the display mode
                document.getElementById("profile-edit").classList.add("hidden");
                document.getElementById("profile-display").classList.remove("hidden");

                alert(result.message || "Profile updated successfully!");
            } else {
                alert(result.error || "Error updating profile.");
            }
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("An error occurred while updating the profile.");
        }
    });
});
