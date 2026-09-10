package backend.users.service;

import backend.common.constants.RoleConstants;
import backend.common.utils.ResponseMessage;
import backend.users.dto.CreateUserDto;
import backend.users.dto.UpdateUserDto;
import backend.users.entity.RoleEntity;
import backend.users.entity.UserEntity;
import backend.users.repository.RoleRepository;
import backend.users.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Transactional
    public ResponseMessage<UserEntity> createUser(CreateUserDto dto) {
        try {
            RoleEntity role = roleRepository.findById(dto.roleId)
                    .orElseThrow(() -> new RuntimeException("Rol no encontrado con id: " + dto.roleId));

            if (RoleConstants.SUPERADMIN.equalsIgnoreCase(role.name) && !isCurrentUserSuperadmin()) {
                return ResponseMessage.error("No se pudo crear el usuario", "No puedes asignar el rol superadmin", 403);
            }

            UserEntity user = new UserEntity();
            user.name = dto.name;
            user.phone = dto.phone;
            user.gender = dto.gender;
            user.address = dto.address;
            user.email = dto.email;
            user.password = passwordEncoder.encode(dto.password);
            user.role = role;
            userRepository.save(user);
            return ResponseMessage.success(user, "Usuario creado correctamente", 1);
        } catch (DataIntegrityViolationException ex) {
            return ResponseMessage.error("No se pudo crear el usuario", "Violacion de integridad de datos", 400);
        } catch (RuntimeException ex) {
            return ResponseMessage.error("No se pudo crear el usuario", ex.getMessage(), 404);
        } catch (Exception ex) {
            return ResponseMessage.error("No se pudo crear el usuario", "Ocurrio un error al crear el usuario", 500);
        }
    }

    @Transactional
    public ResponseMessage<UserEntity> updateUser(UUID id, UpdateUserDto dto) {
        try {
            UserEntity user = userRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Usuario no encontrado con id: " + id));

            if (dto.name != null && !dto.name.isBlank()) user.name = dto.name;
            if (dto.phone != null && !dto.phone.isBlank()) user.phone = dto.phone;
            if (dto.gender != null) user.gender = dto.gender;
            if (dto.address != null && !dto.address.isBlank()) user.address = dto.address;
            if (dto.email != null && !dto.email.isBlank()) user.email = dto.email;
            if (dto.password != null && !dto.password.isBlank()) user.password = passwordEncoder.encode(dto.password);

            if (dto.roleId != null) {
                RoleEntity role = roleRepository.findById(dto.roleId)
                        .orElseThrow(() -> new RuntimeException("Rol no encontrado con id: " + dto.roleId));
                if (RoleConstants.SUPERADMIN.equalsIgnoreCase(role.name) && !isCurrentUserSuperadmin()) {
                    return ResponseMessage.error("No se pudo actualizar el usuario", "No puedes asignar el rol superadmin", 403);
                }
                user.role = role;
            }

            userRepository.save(user);
            return ResponseMessage.success(user, "Usuario actualizado correctamente", 1);
        } catch (DataIntegrityViolationException ex) {
            return ResponseMessage.error("No se pudo actualizar el usuario", "Violacion de integridad de datos", 400);
        } catch (RuntimeException ex) {
            return ResponseMessage.error("No se pudo actualizar el usuario", ex.getMessage(), 404);
        } catch (Exception ex) {
            return ResponseMessage.error("No se pudo actualizar el usuario", "Ocurrio un error al actualizar el usuario", 500);
        }
    }

    public ResponseMessage<UserEntity> getUserById(UUID id) {
        return userRepository.findById(id)
                .map(user -> ResponseMessage.success(user, "Usuario encontrado", 1))
                .orElseGet(() -> ResponseMessage.error("No se pudo obtener el usuario", "Usuario no encontrado con id: " + id, 404));
    }

    @Transactional
    public ResponseMessage<Void> deleteUser(UUID id) {
        if (!userRepository.existsById(id)) {
            return ResponseMessage.error("No se pudo eliminar el usuario", "Usuario no encontrado con id: " + id, 404);
        }
        userRepository.deleteById(id);
        return ResponseMessage.success(null, "Usuario eliminado correctamente", null);
    }

    public ResponseMessage<List<UserEntity>> getAllUsers() {
        List<UserEntity> users = userRepository.findAll();
        return ResponseMessage.success(users, "Usuarios obtenidos correctamente", users.size());
    }

    private boolean isCurrentUserSuperadmin() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null) return false;
        return userRepository.findByEmail(authentication.getName())
                .map(user -> user.role != null && RoleConstants.SUPERADMIN.equalsIgnoreCase(user.role.name))
                .orElse(false);
    }
}
