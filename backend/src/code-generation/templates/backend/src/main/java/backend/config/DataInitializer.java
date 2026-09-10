package backend.config;

import backend.common.constants.PermissionConstants;
import backend.common.constants.RoleConstants;
import backend.users.entity.PermissionEntity;
import backend.users.entity.RoleEntity;
import backend.users.entity.UserEntity;
import backend.users.repository.PermissionRepository;
import backend.users.repository.RoleRepository;
import backend.users.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

@Component
public class DataInitializer implements CommandLineRunner {
    @Autowired private PermissionRepository permissionRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @Value("${superadmin.email}") private String superadminEmail;
    @Value("${superadmin.password}") private String superadminPassword;

    @Override
    @Transactional
    public void run(String... args) {
        createPermissions();
        syncRole(RoleConstants.SUPERADMIN, PermissionConstants.SUPERADMIN_PERMISSION_NAMES);
        syncRole(RoleConstants.ADMIN, PermissionConstants.ADMIN_PERMISSION_NAMES);
        syncRole(RoleConstants.EMPLOYEE, PermissionConstants.EMPLOYEE_PERMISSION_NAMES);
        createSuperAdmin();
    }

    private void createPermissions() {
        for (PermissionConstants.PermissionDefinition definition : PermissionConstants.PERMISSIONS) {
            PermissionEntity permission = permissionRepository.findByName(definition.name())
                    .orElseGet(PermissionEntity::new);
            permission.name = definition.name();
            permission.description = definition.description();
            permissionRepository.save(permission);
        }
    }

    private void syncRole(String name, String[] permissionNames) {
        RoleEntity role = roleRepository.findByName(name).orElseGet(() -> {
            RoleEntity newRole = new RoleEntity();
            newRole.name = name;
            return newRole;
        });
        Set<PermissionEntity> permissions = new HashSet<>();
        Arrays.stream(permissionNames)
                .map(permissionRepository::findByName)
                .flatMap(java.util.Optional::stream)
                .forEach(permissions::add);
        role.permissions = permissions;
        roleRepository.save(role);
    }

    private void createSuperAdmin() {
        if (userRepository.findByEmail(superadminEmail).isPresent()) return;
        UserEntity user = new UserEntity();
        user.name = "Super Admin";
        user.email = superadminEmail;
        user.password = passwordEncoder.encode(superadminPassword);
        user.role = roleRepository.findByName(RoleConstants.SUPERADMIN)
                .orElseThrow(() -> new IllegalStateException("Rol superadmin no encontrado"));
        userRepository.save(user);
    }
}
